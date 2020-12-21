# ses-smtp-credentials-cdk

[![npm version](https://badge.fury.io/js/ses-smtp-credentials-cdk.svg)](https://badge.fury.io/js/ses-smtp-credentials-cdk)

Generate AWS SES SMTP credentials for sending mail via SES.

## What

On the 10th January 2019 AWS changed how SES SMTP authentication works to restrict
access on a per-region basis. This makes providing SES credentials annoyingly hard, if you are automating everything via Cloudformation.

This addresses that.

## Usage

    const credentials = new SesSmtpCredentials(stack, 'Credentials', {
        region: 'eu-west-1'
    });

    new ssm.StringParameter(stack, 'CredentialsParameter', {
        parameterName: 'email',
        stringValue: JSON.stringify({
            username: smtp.username(),
            password: smtp.password(),
        })
    });

## Implementation

1. A user is created in IAM with only permissions for ses:SendRawEmail.
2. The user is given an access key.
3. The secret key is signed for the desired region (see below)
4. the access key and signed secret key are returned as username and password

## Signature algorithm

The algorithm for signing the key is as specified here:

https://docs.aws.amazon.com/ses/latest/DeveloperGuide/smtp-credentials.html

## Nota Bene: Confidentiality of keys

The returned username and password are provided via Cloudformation (rather like the Iam::AccessKey resource), which is potentially a problem for confidentiality. Better would be for this custom resource to write directly to a secret. Patches are welcome.

## Development

### Releasing a new version

Run
```
$ npm version (patch|minor|major)
$ git push origin master [tag you just created]
```
