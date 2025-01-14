/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { generate } from '../../../util';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-dev', 'dev.generate.library');

export default class GenerateLibrary extends SfCommand<void> {
  public static enableJsonFlag = false;
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {};

  // eslint-disable-next-line class-methods-use-this
  public async run(): Promise<void> {
    await generate('library', { force: true });
  }
}
