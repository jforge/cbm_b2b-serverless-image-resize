'use strict';

// https://s3-eu-west-1.amazonaws.com/dev-vitrines-files/dev-lambda-resize-image.zip

// TODO update URL = https://dev-vitrines-files.s3-website-eu-west-1.amazonaws.com

// http://dev-vitrines-files.s3-website-eu-west-1.amazonaws.com/800x600/C000064/1b8d23ad3aacf8752bd72192123573fb.jpg
// https://7i8iyjew03.execute-api.eu-west-1.amazonaws.com/dev/v1?key=/800x600/C000064/1b8d23ad3aacf8752bd72192123573fb.jpg

const AWS = require('aws-sdk');
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);

exports.handler = function (event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));
  const {queryStringParameters, Records} = event;
  const {key} = queryStringParameters;
  let fullImgPath;
  if (queryStringParameters && key && key !== "") {
    console.log("Call from API Gateway.");
    fullImgPath = event.queryStringParameters.key;
  } else if (Records && Records !== "") {
    console.log("Call from S3 Bucket.");
    const imgPath = event.Records.shift().s3.object.key;
    if (imgPath.startsWith("800x600")) {
      console.log("Call from S3 for the resize image !");
      return;
    }
    fullImgPath = '800x600/' + imgPath;
  } else {
    console.log("Call error.");
    callback(null, {
      statusCode: '403',
      headers: {},
      body: 'event :' + JSON.stringify(event, null, 2),
    });
    return;
  }
  // console.log("event : " + event);
  // const key = event.key;
  // const key = "800x600/C000064/1b8d23ad3aacf8752bd72192123573fb.jpg";
  console.log("fullImgPath : " + fullImgPath);
  const match = fullImgPath.match(/((\d+)x(\d+))\/(.*)/);
  //Check if requested resolution is allowed
  if (0 !== ALLOWED_RESOLUTIONS.size && !ALLOWED_RESOLUTIONS.has(match[1])) {
    callback(null, {
      statusCode: '403',
      headers: {},
      body: '',
    });
    return;
  }
  const width = parseInt(match[2], 10);
  const height = parseInt(match[3], 10);
  const originalKey = match[4];
  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(data => Sharp(data.Body)
      .max()
      .withoutEnlargement()
      .resize(width, height)
      .toFormat('png')
      .toBuffer()
    )
    .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/png',
        Key: fullImgPath,
      }).promise()
    )
    .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${fullImgPath}`},
        body: fullImgPath,
      })
    )
    .catch((err) => {
      console.error(err);
      callback(err);
    })
};
