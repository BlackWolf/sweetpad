import { getWorkspacePath } from "../build/utils";
import { ExecBaseError, ExecError } from "./errors";
import { prepareEnvVars } from "./helpers";
import { commonLogger } from "./logger";

import { execa } from "execa";
import { spawn } from 'child_process';

type ExecaError = {
  command: string;
  escapedCommand: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
  killed: boolean;
  signal?: string;
  signalDescription?: string;
  cwd: string;
  message: string;
  shortMessage: string;
  originalMessage: string;
};

export async function exec(options: {
  command: string;
  args: string[];
  cwd?: string;
  env?: { [key: string]: string | null };
}): Promise<string> {
  const cwd = options.cwd ?? getWorkspacePath();

  commonLogger.debug("Executing command", {
    command: options.command,
    args: options.args,
    cwd: cwd,
    env: options.env,
  });

  const env = prepareEnvVars(options.env);

  let result: any;
  try {
    result = await execa(options.command, options.args, {
      cwd: cwd,
      env: env,
    });
  } catch (e: any) {
    const errorMessage: string = e?.shortMessage ?? e?.message ?? "[unknown error]";
    const stderr: string | undefined = e?.stderr;
    // todo: imrove logging
    throw new ExecBaseError(`Error executing "${options.command}" command`, {
      errorMessage: errorMessage,
      stderr: stderr,
      command: options.command,
      args: options.args,
      cwd: cwd,
    });
  }

  commonLogger.debug("Command executed", {
    command: options.command,
    args: options.args,
    cwd: cwd,
    stdout: result.stdout,
    stderr: result.stderr,
  });

  // check error code
  if (result.stderr && !result.stdout) {
    throw new ExecError(`Error executing "${options.command}" command`, {
      stderr: result.stderr,
      command: options.command,
      args: options.args,
      cwd: cwd,
      errorMessage: "[stderr not empty]",
    });
  }

  return result.stdout;
}

export function execStreaming(options: {
  command: string;
  args: string[];
  cwd?: string;
  env?: { [key: string]: string | null };
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onClose?: (code: number | null) => void;
  signal?: AbortSignal;
}) {
  const cwd = options.cwd ?? getWorkspacePath();

  const process = spawn(options.command, options.args, {
    cwd: cwd,
    env: prepareEnvVars(options.env),
    shell: false,
  });

  // Handle abort signal if provided
  if (options.signal) {
    // If the signal is already aborted, kill the process immediately
    if (options.signal.aborted) {
      process.kill();
      return;
    }

    // Otherwise set up a listener for future abort signals
    options.signal.addEventListener('abort', () => {
      if (!process.killed) {
        process.kill();
        console.log('Process terminated due to abort signal');
      }
    }, { once: true });
  }

  process.stdout.on('data', (data) => {
    options.onStdout?.(data.toString());
  });

  process.stderr.on('data', (data) => {
    options.onStderr?.(data.toString());
  });

  process.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
    options.onClose?.(code);
  });
}