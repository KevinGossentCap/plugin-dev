/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import * as Generator from 'yeoman-generator';
import yosay = require('yosay');
import { pascalCase } from 'change-case';
import { set } from '@salesforce/kit';
import { get } from '@salesforce/ts-types';
import { exec } from 'shelljs';
import { PackageJson, Topic } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const { version } = require('../../package.json');

export interface CommandGeneratorOptions extends Generator.GeneratorOptions {
  name: string;
  nuts: boolean;
  unit: boolean;
}

/** returns the modifications that need to be made for the oclif pjson topics information.  Returns an empty object for "don't change anything" */
export function addTopics(
  newCmd: string,
  existingTopics: Record<string, Topic>,
  commands: string[] = []
): Record<string, Topic> {
  const updated: Record<string, Topic> = {};

  const paths = newCmd
    .split(':')
    // omit last word since it's not a topic, it's the command name
    .slice(0, -1)
    .map((_, index, array) => array.slice(0, index + 1).join('.'))
    // reverse to build up the object from most specific to least
    .reverse();

  for (const p of paths) {
    const pDepth = p.split('.').length;
    // if new command if foo.bar and there are any commands in the foo topic, this should be marked external.
    // if new command if foo.bar.baz and there are any commands in the foo.bar subtopic, it should be marked external.
    const isExternal = commands.some((c) => c.split('.').slice(0, pDepth).join('.') === p);
    const existing = get(updated, p);
    if (existing) {
      const merged = isExternal
        ? {
            external: true,
            subtopics: existing,
          }
        : {
            description: get(existingTopics, `${p}.description`, `description for ${p}`),
            subtopics: existing,
          };
      set(updated, p, merged);
    } else {
      const entry = isExternal
        ? { external: true }
        : { description: get(existingTopics, `${p}.description`, `description for ${p}`) };
      set(updated, p, entry);
    }
  }

  return updated;
}

export default class Command extends Generator {
  public declare options: CommandGeneratorOptions;
  public pjson!: PackageJson;

  private internalPlugin = false;

  public constructor(args: string | string[], opts: CommandGeneratorOptions) {
    super(args, opts);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async prompting(): Promise<void> {
    this.pjson = this.fs.readJSON('package.json') as unknown as PackageJson;
    this.log(yosay(`Adding a command to ${this.pjson.name} Version: ${version as string}`));

    if (Object.keys(this.pjson.devDependencies).includes('@salesforce/plugin-command-reference')) {
      // Get a list of all commands in `sf`. We will use this to determine if a topic is internal or external.
      const sfCommandsStdout = exec('sf commands --json', { silent: true }).stdout;
      const commandsJson = JSON.parse(sfCommandsStdout) as Array<{ id: string }>;
      const commands = commandsJson.map((command) => command.id.replace(/:/g, '.').replace(/ /g, '.'));

      const newTopics = addTopics(this.options.name, this.pjson.oclif.topics, commands);
      this.pjson.oclif.topics = { ...this.pjson.oclif.topics, ...newTopics };
      this.internalPlugin = true;
    } else {
      const newTopics = addTopics(this.options.name, this.pjson.oclif.topics);
      this.pjson.oclif.topics = { ...this.pjson.oclif.topics, ...newTopics };
    }

    this.fs.writeJSON('package.json', this.pjson);
  }

  public writing(): void {
    this.writeCmdFile();
    this.writeMessageFile();
    this.writeNutFile();
    this.writeUnitTestFile();
  }

  public end(): void {
    exec('yarn format');
    exec('yarn lint -- --fix');
    exec('yarn compile');

    const localExecutable = process.platform === 'win32' ? path.join('bin', 'dev.cmd') : path.join('bin', 'dev');

    if (this.pjson.scripts['test:deprecation-policy']) {
      exec(`${localExecutable} snapshot:generate`);
    }

    if (this.pjson.scripts['test:json-schema']) {
      exec(`${localExecutable} schema:generate`);
    }
  }

  private getMessageFileName(): string {
    return this.options.name.replace(/:/g, '.');
  }

  private writeCmdFile(): void {
    this.sourceRoot(path.join(__dirname, '../../templates'));
    const cmdPath = this.options.name.split(':').join('/');
    const commandPath = this.destinationPath(`src/commands/${cmdPath}.ts`);
    const className = pascalCase(this.options.name);
    const opts = {
      ...this.options,
      className,
      returnType: `${className}Result`,
      commandPath,
      year: new Date().getFullYear(),
      copyright: this.internalPlugin,
      pluginName: this.pjson.name,
      messageFile: this.getMessageFileName(),
    };
    this.fs.copyTpl(this.templatePath('src/command.ts.ejs'), commandPath, opts);
  }

  private writeMessageFile(): void {
    this.sourceRoot(path.join(__dirname, '../../templates'));
    const filename = this.getMessageFileName();
    const messagePath = this.destinationPath(`messages/${filename}.md`);
    this.fs.copyTpl(this.templatePath('messages/message.md.ejs'), messagePath, this.options);
  }

  private writeNutFile(): void {
    if (!this.options.nuts) return;
    this.sourceRoot(path.join(__dirname, '../../templates'));
    const cmdPath = this.options.name.split(':').join('/');
    const nutPah = this.destinationPath(`test/commands/${cmdPath}.nut.ts`);
    const opts = {
      cmd: this.options.name.replace(/:/g, ' '),
      year: new Date().getFullYear(),
      copyright: this.internalPlugin,
      pluginName: this.pjson.name,
      messageFile: this.getMessageFileName(),
    };
    this.fs.copyTpl(this.templatePath('test/command.nut.ts.ejs'), nutPah, opts);
  }

  private writeUnitTestFile(): void {
    if (!this.options.unit) return;
    this.sourceRoot(path.join(__dirname, '../../templates'));
    const cmdPath = this.options.name.split(':').join('/');
    const unitPath = this.destinationPath(`test/commands/${cmdPath}.test.ts`);
    this.fs.copyTpl(this.templatePath('test/command.test.ts.ejs'), unitPath, {
      ...this.options,
      name: this.options.name.replace(/:/g, ' '),
      year: new Date().getFullYear(),
      copyright: this.internalPlugin,
    });
  }
}
