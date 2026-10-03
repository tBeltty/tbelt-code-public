# Safety

## Status

tBelt Code is a developer preview. It has not had a security audit, so do not treat it as secure or ready for production work.

The app runs commands and code that a model writes, can load third-party plugins, and can reach the network, your files and any credentials you give it. A wrong answer from the model, a bug, a bad setting, malicious input or an untrusted plugin can damage your computer, change or delete files, or leak data and credentials.

## Sandbox limits

The sandbox, the confirmation prompts and the per-session access levels lower the risk, but they do not guarantee isolation. They cannot protect anything that you allowed a session to reach. Do not rely on tBelt Code as your only safeguard for untrusted work.

## What leaves your computer

Your messages and the code a session reads go to the model provider you configure, under that provider's terms. tBelt Code sends no telemetry and no session content anywhere else, and it does not upload sessions to DeepSeek by default, whichever provider you use. The app also checks tbelt.online for new versions.

No provider is configured until you add one. If you want no request to reach a given provider, do not configure it, and block its API host in your firewall for extra assurance.

## Responsible use

- Give a session only the access it needs.
- Prefer a disposable virtual machine, container or separate account.
- Keep backups of the files a session can reach.
- Do not hand it sensitive credentials or data unless you accept the risk.
- Review plugins, settings and proposed commands before you let them run.

## No warranty or liability

You use tBelt Code at your own risk. It is provided without warranty under its [license](LICENSE). To the maximum extent the law allows, the authors and copyright holders are not responsible for damage to computers, loss or disclosure of data, loss of files, or other harm that comes from using it.
