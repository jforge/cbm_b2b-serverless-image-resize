'use strict';
const AWS = require('aws-sdk');
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);

exports.handler = function (event, context, callback) {
  const { queryStringParameters, Records } = event;
  let resizedImgPath;
  // extract info from event
  if (queryStringParameters && queryStringParameters.key && queryStringParameters.key !== "") {
    console.info("call from API Gateway");
    resizedImgPath = queryStringParameters.key;
  } else if (Records && Records !== "") {
    console.info("call from s3 bucket");
    if (event.Records[0].s3.object.key.startsWith("800x600")) {
      return;
    }
    let path = Records[0].s3.object.key;
    let folder = path.substring(0,path.indexOf('/'));
    let img = path.substring(path.length,path.indexOf('/'));
    resizedImgPath = `${folder}/800x600/${img}`;
  } else {
    console.error("can't extract info from payload, returning 403");
    callback(null, {
      statusCode: '403',
      headers: {},
      body: 'event :' + JSON.stringify(event, null, 2),
    });
    return;
  }

  // extract info from route params
  const match = resizedImgPath.match(/((\d+)x(\d+))\/(.*)/);
  const width = parseInt(match[2], 10);
  const height = parseInt(match[3], 10);
  const originalImgPath = match[4];

  // prevent resizing for not supported resolutions
  if (0 !== ALLOWED_RESOLUTIONS.size && !ALLOWED_RESOLUTIONS.has(match[1])) {
    console.warn(`wanted resolution ${match[1]} is not allowed`);
    callback(null, {
      statusCode: '403',
      headers: {},
      body: `wanted resolution ${match[1]} is not allowed`,
    });
    return;
  }

  S3.getObject({Bucket: BUCKET, Key: originalImgPath}).promise()
    // get original img
    .then(data => Sharp(data.Body)
      .resize(width, height)
      .min()
      .withoutEnlargement()
      .jpeg()
      .toBuffer()
    )
    // upload resized image to s3
    .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/jpeg',
        Key: resizedImgPath,
      }).promise()
    )
    // return 301 with new resized img path
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