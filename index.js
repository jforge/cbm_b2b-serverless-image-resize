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
  const file = match[5];
  const originalImgPath = `${folder}/${file}`;
  const resolution = `${width}x${height}`;
  console.log('getInfoFromPath', {
    width,
    height,
    originalImgPath,
    resolution
  });
  return {match, width, height, originalImgPath, resolution};
};

exports.handler = function (event, context, callback) {
  console.warn(JSON.stringify(event));
  const {queryStringParameters, Records} = event;
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
  }
  if (isApiGatewayEvent) {
    console.info("isApiGatewayEvent : payload => ",queryStringParameters.key );
    resizedImgPath = queryStringParameters.key;
  }
  if (isS3Event) {
    const {eventName} = Records;
    const isDeleteEvent = eventName === 'ObjectRemoved:DeleteMarkerCreated';
    const isPutEvent = eventName === 'ObjectCreated:Put';
    const path = Records[0].s3.object.key;
    if (isPutEvent) {
      console.log('call from S3 - event : put - todo : create folders &' +
        ' resize imgs now');
      ALLOWED_RESOLUTIONS.forEach((value) => {
        const [width, height] = value.split('x');
        //const { width, height, originalImgPath } =
        // getInfoFromPath(resizedImgPath);
        //resizeAndUploadToS3(originalImgPath, width, height,
        // resizedImgPath, callback);
      });
    }
    if (isDeleteEvent) {
      console.log('call from S3 - event : delete, delete resized img folders' +
        ' + original img');
      // TODO delete resized folder(s)
    }
    // do not resize resized images when they are put in the bucket,
    // prevents infinite loop
    // if (event.Records[0].s3.object.key.startsWith("800x600")) return;
    const folder = path.substring(0, path.indexOf('/'));
    const img = path.substring(path.length, path.indexOf('/'));
    resizedImgPath = `${folder}/800x600/${img}`;
    console.log("call from s3, resizedImgPath", resizedImgPath);
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