/* eslint-disable no-console */
import * as path from 'path';
import { writeFile } from '../files';
import { shell } from '../shell';
import { LoginInformation } from './codeartifact';
import { parallelShell } from './parallel-shell';
import { addToEnvFile } from './usage-dir';

export async function uploadPythonPackages(packages: string[], login: LoginInformation, usageDir: string) {
  await shell(['pip', 'install', 'twine'], { show: 'error' });

  // Even though twine supports uploading all packages in one go, we have to upload them
  // individually since CodeArtifact does not support Twine's `--skip-existing`. Fun beans.
  await parallelShell(packages, async (pkg, output) => {
    console.log(`⏳ ${pkg}`);

    await shell(['twine', 'upload', '--verbose', pkg], {
      modEnv: {
        TWINE_USERNAME: 'aws',
        TWINE_PASSWORD: login.authToken,
        TWINE_REPOSITORY_URL: login.pypiEndpoint,
      },
      show: 'error',
      output,
    });

    console.log(`✅ ${pkg}`);
  }, (pkg, output) => {
    if (output.toString().includes('This package is configured to block new versions') || output.toString().includes('409 Conflict')) {
      console.log(`❌ ${pkg}: already exists. Skipped.`);
      return true;
    }
    return false;
  });

  // Write pip config file and set environment var
  await writeFile(path.join(usageDir, 'pip.conf'), [
    '[global]',
    `index-url = https://aws:${login.authToken}@${login.pypiEndpoint.replace(/^https:\/\//, '')}simple/`,
  ].join('\n'));
  await addToEnvFile(usageDir, 'PIP_CONFIG_FILE', `${usageDir}/pip.conf`);
}