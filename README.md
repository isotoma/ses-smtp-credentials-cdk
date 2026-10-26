# ses-smtp-credentials-cdk

[![npm version](https://badge.fury.io/js/ses-smtp-credentials-cdk.svg)](https://badge.fury.io/js/ses-smtp-credentials-cdk)

Generate AWS SES SMTP credentials for sending mail via SES.

## What

On the 10th January 2019 AWS changed how SES SMTP authentication works to restrict
access on a per-region basis. This makes providing SES credentials annoyingly hard, if you are automating everything via Cloudformation.

This addresses that.

## Usage

```typescript
import { SesSmtpCredentials } from 'ses-smtp-credentials-cdk';

// ...

const smtpCredentials = new SesSmtpCredentials(this, 'Credentials', {
    region: 'eu-west-1'
});

new ssm.StringParameter(this, 'CredentialsParameter', {
    parameterName: 'email',
    stringValue: JSON.stringify({
        username: smtpCredentials.username(),
        password: smtpCredentials.password(),
    })
});
```

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

The tag triggers a GitHub Actions job that stages the release on npm.

#### Approving the release

Pushing the tag does not put anything in front of consumers. The workflow uses
[staged publishing](https://docs.npmjs.com/staged-publishing/): the version lands
in the registry but is not installable until a maintainer approves it with 2FA.

After the tag job goes green, approve it in the Staged Packages tab on npmjs.com,
or from the CLI:

```bash
npm stage list
npm stage approve <stage-id>
```

`npm stage reject` discards it instead. A staged version occupies its version
number, so to stage the same version again, reject the existing stage first.

#### Authentication

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
over OIDC, so there is no `NPM_TOKEN` secret. The job requests `id-token: write`
and the npm CLI exchanges that for a short-lived token, which also generates
provenance attestations automatically.

The trust relationship is configured on npmjs.com under the package's settings,
naming the organisation, the repository, and the workflow filename
(`publish.yaml`). Existing configurations cannot be edited, only deleted and
recreated.

Staged publishing needs npm 11.15.0 or later, above what Node 24 bundles, so the
workflow installs npm explicitly and asserts the version. Below that floor the
CLI falls back to token authentication and fails with a misleading `E404`.

OIDC covers `npm publish` and `npm stage publish` only. The approve, reject, list
and view subcommands need interactive authentication and cannot use it.
