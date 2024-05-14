import {
    CloudFormationCustomResourceCreateEvent,
    CloudFormationCustomResourceDeleteEvent,
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceResponse,
    CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { IAM } from '@aws-sdk/client-iam';
import * as crypto from 'crypto';
import * as utf8 from 'utf8';

const policyName = 'ses-smtp-credentials-policy';

export const sign = (key: string[], msg: string) => {
    // Typescript refuses to allow digest('binary') on this without the type
    // hacking. a bug somewhere.
    const hmac = crypto.createHmac('sha256', Buffer.from(key.map((a) => a.charCodeAt(0)))).update(utf8.encode(msg)) as any;

    return hmac.digest('binary').toString().split('');
};

export const getSmtpPassword = (key: string, region: string) => {
    const date = '11111111';
    const service = 'ses';
    const terminal = 'aws4_request';
    const message = 'SendRawEmail';
    const versionInBytes = [0x04];

    let signature = sign(utf8.encode('AWS4' + key).split(''), date);
    signature = sign(signature, region);
    signature = sign(signature, service);
    signature = sign(signature, terminal);
    signature = sign(signature, message);

    const signatureAndVersion = versionInBytes.slice(); //copy of array

    signature.forEach((a: string) => signatureAndVersion.push(a.charCodeAt(0)));

    return Buffer.from(signatureAndVersion).toString('base64');
};

export const onCreate = async (event: CloudFormationCustomResourceCreateEvent): Promise<CloudFormationCustomResourceResponse> => {
    const region = event.ResourceProperties.Region;
    const iam = new IAM();

    const now = new Date();
    const userName = `ses-user-${now.toISOString().replace('T', '.').replace('Z', '').replace(/:/g, '-')}`;

    const user = await iam
        .createUser({
            UserName: userName,
        });
    if (!user.User) {
        throw new Error('No user created');
    }
    const policy = await iam
        .putUserPolicy({
            UserName: user.User.UserName,
            PolicyName: policyName,
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Allow',
                    Action: 'ses:SendRawEmail',
                    Resource: '*',
                },
            }),
        });
    const accessKey = await iam
        .createAccessKey({
            UserName: user.User.UserName,
        });
    const username = accessKey.AccessKey.AccessKeyId;
    const secretKey = accessKey.AccessKey.SecretAccessKey;
    const password = getSmtpPassword(secretKey, region);
    return {
        Status: 'SUCCESS',
        PhysicalResourceId: `${user.User.UserName}/${accessKey.AccessKey.AccessKeyId}`,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: {
            Username: username,
            Password: password,
        },
    };
};

export const onUpdate = async (event: CloudFormationCustomResourceUpdateEvent): Promise<CloudFormationCustomResourceResponse> => {
    return {
        Status: 'SUCCESS',
        RequestId: event.RequestId,
        StackId: event.StackId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: event.PhysicalResourceId,
    };
};

export const onDelete = async (event: CloudFormationCustomResourceDeleteEvent): Promise<CloudFormationCustomResourceResponse> => {
    const iam = new IAM();
    const [username, accessKeyId] = event.PhysicalResourceId.split(/\//);
    await iam
        .deleteAccessKey({
            UserName: username,
            AccessKeyId: accessKeyId,
        });
    await iam
        .deleteUserPolicy({
            UserName: username,
            PolicyName: policyName,
        });
    await iam
        .deleteUser({
            UserName: username,
        });
    return {
        Status: 'SUCCESS',
        RequestId: event.RequestId,
        StackId: event.StackId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: event.PhysicalResourceId,
    };
};

export const onEvent = (event: CloudFormationCustomResourceEvent): Promise<CloudFormationCustomResourceResponse> => {
    console.log(JSON.stringify(event));
    try {
        switch (event.RequestType) {
            case 'Create':
                return onCreate(event as CloudFormationCustomResourceCreateEvent);
            case 'Update':
                return onUpdate(event as CloudFormationCustomResourceUpdateEvent);
            case 'Delete':
                return onDelete(event as CloudFormationCustomResourceDeleteEvent);
            default:
                return Promise.reject(`Unknown event type in event ${event}`);
        }
    } catch (err) {
        console.error(err);
        return Promise.reject('Failed');
    }
};
