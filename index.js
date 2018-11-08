const AWSS3 = require('aws-sdk/clients/s3');
const S3 = new AWSS3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);

const getInfoFromPath = (newPath) => {
  const match = newPath.match(/(\w+)\/?(\D*)\/(\d+)x(\d+)\/(\S+)/);
  const folder = match[2] === '' ? match[1] : `${match[1]}/${match[2]}`;
  const width = parseInt(match[3], 10);
  const height = parseInt(match[4], 10);
  const file = match[5].replace('/','');
  const originalImgPath = `${folder}/${file}`;
  const resolution = `${width}x${height}`;
  return {match, width, height, originalImgPath, resolution};
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
  } else if (isApiGatewayEvent) {
    resizedImgPath = queryStringParameters.key;
  } else if (isS3Event) {
    const [ record ] = Records;
    const {eventName} = record;
    console.log('s3 event =>>>>', eventName);
    const isDeleteEvent = eventName === 'ObjectRemoved:Delete';
    const isPutEvent = eventName === 'ObjectCreated:Put';
    const path = Records[0].s3.object.key;
    // do not resize non-img file formats
    const ALLOWED_FORMATS = ['png','jpg','gif'];
    ALLOWED_FORMATS.forEach((format) => {
      if (!path.includes(format)) callback();
    });
    const folder = path.substring(0, path.indexOf('/'));
    if (isPutEvent) {
      console.log('call from S3 - event : put');
      ALLOWED_RESOLUTIONS.forEach((resolution) => {
        // prevent infinite loop : do not resize already resized imgs
        if (path.includes(resolution)) return;
        const [width, height] = resolution.split('x');
        const img = path.substring(path.length, path.indexOf('/')).replace('/','');
        resizedImgPath = `${folder}/${width}x${height}/${img}`;
        console.log('resizing for each resolution : ', `${width}x${height}`, resizedImgPath);
        resizeAndUploadToS3(path, parseInt(width,10), parseInt(height,10), resizedImgPath, callback);
      });
    } else if (isDeleteEvent) {
      const params = {
        Bucket: BUCKET,
        Prefix: folder
      };
      console.log('delete event : folder to delete =>>>', params);
      S3.listObjectsV2(params, (err, data) => {
        console.log('delete event : data to delete =>>>', data.Contents.map(img => ({Key: img.Key})));
        if (err) {
          console.error(err, err.stack);
        } else {
          const params = {
            Bucket: BUCKET,
            Delete: {
              Objects: data.Contents.map(img => ({Key: img.Key}))
            },
          };
          S3.deleteObjects(params, (err, data) => {
            console.log('S3.deleteObjects params =>>>', JSON.stringify(params))
            if (err) {
              console.error(err, err.stack);
            } else {
              console.log('deleted object', JSON.stringify(data));
            }
          });
        }
      });
    } else {
      // GET EVENT
      const folder = path.substring(0, path.indexOf('/'));
      const img = path.substring(path.length, path.indexOf('/'));
      resizedImgPath = `${folder}/800x600/${img}`;
      console.log("call from s3, resizedImgPath", resizedImgPath);
    }
  } else {
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
    const folder = path.substring(0, path.indexOf('/'));
    const img = path.substring(path.length, path.indexOf('/'));
    resizedImgPath = `${folder}/800x600/${img}`;
    resizeAndUploadToS3(originalImgPath, width, height, resizedImgPath, callback);
  }
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