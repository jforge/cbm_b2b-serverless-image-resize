const AWSS3 = require('aws-sdk/clients/s3');
const S3 = new AWSS3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);

const getInfoFromPath = (path) => {
  console.log('getInfoFromPath : path =>>>', path);
  const match = path.match(/(\w+)\/?(\D*)\/(\d+)x(\d+)\/(\S+)/);
  const folder = match[2] === '' ? match[1] : `${match[1]}/${match[2]}`;
  const width = parseInt(match[3], 10);
  const height = parseInt(match[4], 10);
  const file = match[5].replace('/', '');
  const originalImgPath = `${folder}/${file}`;
  const resolution = `${width}x${height}`;
  console.log('getInfoFromPath', {
    match,
    width,
    height,
    originalImgPath,
    resolution
  });
  return {match, width, height, originalImgPath, resolution, folder, file};
};

exports.handler = function (event, context, callback) {
  const {queryStringParameters, Records} = event;
  console.log('event =>>>', JSON.stringify(event));
  const isApiGatewayEvent = queryStringParameters && queryStringParameters.key && queryStringParameters.key !== "";
  const isS3Event = Records && Records !== "";
  let resizedImgPath;
  // extract info from event
  if (!isS3Event && !isApiGatewayEvent) {
    console.error("can't extract info from payload, returning 403");
    callback(null, {
      statusCode: '403',
      headers: {},
      body: 'event :' + JSON.stringify(event, null, 2),
    });
    return;
  } else if (isApiGatewayEvent) {
    resizedImgPath = queryStringParameters.key;
  } else if (isS3Event) {
    const [record] = Records;
    const {eventName} = record;
    const isDeleteEvent = eventName === 'ObjectRemoved:Delete';
    const isPutEvent = eventName === 'ObjectCreated:Put';
    const path = Records[0].s3.object.key;
    console.log('path =>>>', path);
    const ALLOWED_IMG_FORMATS = ['png', 'jpg', 'gif'];
    ALLOWED_IMG_FORMATS.forEach((format) => {
      // do not resize non-img file formats
      if (!path.includes(format)) callback();
    });
    const folder = path.substring(0, path.indexOf('/'));
    if (isPutEvent) {
      console.log('S3 isPutEvent');
      const params = {
        Bucket: BUCKET,
        Key: path
      };
      S3.headObject(params, (err) => {
        if (err && err.code === 'NotFound') {
          console.log("isPutEvent - NotFound");
          // TODO first put, do nothing
        } else {
          console.log("isPutEvent - Found - update scenario : delete all" +
            " resized folders for that img")
          // TODO update scenario, delete all resized folders
        }
      });
    } else if (isDeleteEvent) {
      console.log('S3 isDeleteEvent');
      const match = path.match(/(\w+)\/?(\D*)\/(\d+)x(\d+)\/(\S+)/);
      const hasResolution = match != null;
      if (hasResolution) return; // do nothing when deleting already resized imgs
      const params = {
        Bucket: BUCKET,
        Prefix: `${folder}/`,
        Delimiter: '/'
      };
      console.log('delete event : folder to delete =>>>', params);
      S3.listObjectsV2(params, (err, data) => {
        console.log('data =>>>', data);
        console.log('data.CommonPrefixes =>>>', data.CommonPrefixes);
        // list all resized img folders under C0XXXXX and delete them
        data.CommonPrefixes.forEach(({Prefix}) => {
          console.log('deleting =>>>> Prefix', Prefix);
          const params = {
            Bucket: BUCKET,
            Prefix: Prefix,
          };
          console.log('delete event : folder to delete =>>>', params);
          S3.listObjectsV2(params, (err, folder) => {
            console.log('rezised folder data : ', folder);
            const params = {
              Bucket: BUCKET,
              Delete: {
                Objects: folder.Contents.map(img => ({Key: img.Key}))
              },
            };
            S3.deleteObjects(params, (err, data) => {
              if (err) {
                console.error(err, err.stack);
              } else {
                console.log('deleted : ', data);
              }
            });
          });
        });
      });
      return;
    } else {
      console.log('S3 isGetEvent');
      const folder = path.substring(0, path.indexOf('/'));
      const img = path.substring(path.length, path.indexOf('/'));
      const {resolution} = getInfoFromPath(path);
      resizedImgPath = `${folder}/${resolution}/${img}`;
    }
  }
  // extract info from path
  const {match, width, height, originalImgPath, resolution} = getInfoFromPath(resizedImgPath);
  const isResolutionAllowed = 0 !== ALLOWED_RESOLUTIONS.size && ALLOWED_RESOLUTIONS.has(resolution);
  // prevent resizing for not supported resolutions
  if (!isResolutionAllowed) {
    console.warn(`wanted resolution ${match[1]} is not allowed`);
    callback(null, {
      statusCode: '403',
      headers: {},
      body: `wanted resolution ${match[1]} is not allowed`,
    });
    return;
  }
  resizeAndUploadToS3(originalImgPath, width, height, resizedImgPath, callback);
};

const resizeAndUploadToS3 = (originalImgPath, width, height, resizedImgPath, callback) => {
  console.log('resizeAndUploadToS3 =>>>', resizedImgPath);
  // get original img
  S3.getObject({Bucket: BUCKET, Key: originalImgPath})
    .promise()
    .then(({Body}) => Sharp(Body)
      .resize(width, height)
      .max()
      .withoutEnlargement()
      .toBuffer()
    )
    .then(buffer => {
        // get img format from buffer in order to set correct ContentType
        Sharp(buffer)
          .metadata()
          .then(({format}) => {
            // upload resized image to s3 bucket
            S3.putObject({
              Body: buffer,
              Bucket: BUCKET,
              ContentType: `image/${format}`,
              Key: resizedImgPath,
            }).promise()
          });
      }
    )
    // return 301 with resized img path
    .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${resizedImgPath}`},
        body: resizedImgPath,
      })
    )
    // handle errors
    .catch((err) => {
      console.error(err);
      callback(err);
    })
};