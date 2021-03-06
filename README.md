

# serverless-image-resize
Inspired by : https://aws.amazon.com/fr/blogs/compute/resize-images-on-the-fly-with-amazon-s3-aws-lambda-and-amazon-api-gateway/

# Description

This project is used as a Lambda function to resize existing images in Amazon S3.
When a targeted image resolution is not found in S3, a redirection rule on the S3 calls the Amazon API Gateway which calls  this Lambda to resize the image.
The next request for the resized image will be served from S3 directly.

More info : TODO : Neo link

# Resize behaviour

The Lambda resizes the image to `width` x `height` given in route params.

Allowed combos : `300x220`, `150x110`, `650x330`


:warning: **Preserving aspect ratio, it resizes the image to be as large as possible while ensuring its dimensions are less than or equal to the width and height specified.
It does not enlarge the output image if the input image width or height are already less than the required dimensions.** 

# Process

![Sequence Diagram](./diagram.svg)

## Installing / Getting started

Here's a brief intro about what a developer must do in order to start developing the project further:

```shell
git clone https://github.com/axel-springer-kugawana/cbm_serverless-image-resize.git
cd cbm_serverless-image-resize/
```
To buid this project you will need **Node 8.10 (or 6.10)** to be compatible with Lambda's versions.

- You can use this docker image to use **Node 8.10** this project :
```shell
# docker run -it -v "$PWD":/var/task lambci/lambda:build-nodejs8.10 /bin/bash
```
- Remove older installation and install : 
```shell
rm -rf node_modules/ && npm i && exit
```

And state what happens step-by-step.


## Local testing with SAM 
Prerequisites : 
- [sam-cli](https://github.com/awslabs/aws-sam-cli/blob/develop/docs/installation.rst)

Then, to run the lambda locally :
- run lambda from ApiGateway event :

`sam local invoke "ResizeImageLambda" --env-vars env_sam.json -e event_apigateway.json` 

- run lambda from s3 event :
 
 ```sam local invoke "ResizeImageLambda" --env-vars env_sam.json -e event_s3_put.json``` 

It will call the lambda with environment variables provided by `env_sam.json` && event provided by `event_apigateway.json` 
## Deploying / Publishing

CodePipeline will deploy the Lambda on every push event, just commit your changes & push.

or 


- Create the package :

```rm -rf ../dev-lambda-resize-image.zip && zip -r ../dev-lambda-resize-image.zip *```

- Upload it to S3 (it will be used as source for Lambda) :

```aws s3 cp ../dev-lambda-resize-image.zip s3://dev-vitrines-files/dev-lambda-resize-image.zip```

## Configuration / Parameters


### 1. Query Parameters :
- #### "key"
Type: `String`  
The path of image to be resized. Example : `800x600/X000001/1b8d23ad3aacf8752bd72192123573fb.jpg`

### 2. Environnement :
- #### "BUCKET"
Type: `String`  
The bucket name. Example. `dev-vitrines-files`
- #### "URL"
Type: `String`  
The url of S3 storage. Example . https://s3-eu-west-1.amazonaws.com/
- #### "ALLOWED_RESOLUTIONS"
The list of allowed resolutions. Example `800x600`


## Lambda creation steps

1. Create the new Lambda : vitrines-lambda-dev-resize-image
2. Create a new Role and attach it to the Lambda   : vitrines-lambda-dev-resize-image-role
3. Create a new Policies : vitrines-resize-image-s3-dev-vitrines-files-dev
Description : Allow List, Read, Write on Bucket dev-vitrines-files
Content : 
```JSON
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "s3:ListBucket",
                    "s3:PutObject",
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::dev-vitrines-files",
                    "arn:aws:s3:::dev-vitrines-files/*"
                ],
                "Effect": "Allow"
            }
        ]
    }
```
4. Bucket Configuration.
Select the Bucket > Properties > Static website hosting > Use this bucket to host a website > Redirection rules :
```XML
<RoutingRules>
  <RoutingRule>
    <Condition>
      <KeyPrefixEquals/>
      <HttpErrorCodeReturnedEquals>404</HttpErrorCodeReturnedEquals>
    </Condition>
    <Redirect>
      <Protocol>https</Protocol>
      <HostName>7i8iyjew03.execute-api.eu-west-1.amazonaws.com</HostName>
      <ReplaceKeyPrefixWith>dev/v1?key=</ReplaceKeyPrefixWith>
      <HttpRedirectCode>307</HttpRedirectCode>
    </Redirect>
  </RoutingRule>
</RoutingRules>
```


## Test 

You can use this Test Event to test this lambda function:
EventResizeTest = 
```
{
  "queryStringParameters": {
      "key" : "800x600/C000064/1b8d23ad3aacf8752bd72192123573fb.jpg"
  }
}
```


Test KO : https://s3-eu-west-1.amazonaws.com/dev-vitrines-files/C800x600/000064/1b8d23ad3aacf8752bd72192123573fb.jpg

Test OK : http://dev-vitrines-files.s3-website-eu-west-1.amazonaws.com/800x600/C000064/1b8d23ad3aacf8752bd72192123573fb.jpg

This test will create the new sized image in new folder "800x600" .


## Links

TODO : link to NEO.
