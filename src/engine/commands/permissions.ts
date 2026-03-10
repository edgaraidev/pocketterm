import type { CommandDefinition } from './types';

const chmod: CommandDefinition = {
  name: 'chmod',
  async execute(args, ctx) {
    const mode = args[0];
    const path = args[1];
    if (!mode || !path) { ctx.out('chmod: missing operand'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, path);
    const ok = ctx.fs.chmod(resolved, mode, ctx.user, ctx.sudo);
    if (!ok) ctx.out(`chmod: cannot change permissions of '${path}': Operation not permitted`);
  },
  man: `CHMOD(1)                     User Commands                    CHMOD(1)

NAME
       chmod - change file mode bits (permissions)

SYNOPSIS
       chmod MODE FILE

DESCRIPTION
       Change the file permission bits. Permissions control who can read (r),
       write (w), and execute (x) a file.

       MODE is a 3-digit octal number (e.g., 755, 644). Each digit controls
       a different scope:
         First digit:  Owner permissions
         Second digit: Group permissions
         Third digit:  Other (everyone else) permissions

       Digit values:
         4 = read (r)    2 = write (w)    1 = execute (x)
         Combine by adding: 7 = rwx, 6 = rw-, 5 = r-x, 4 = r--

EXAMPLES
       chmod 755 script.sh     Owner: rwx, Group: r-x, Others: r-x
       chmod 644 config.txt    Owner: rw-, Group: r--, Others: r--
       chmod 600 secret.key    Owner: rw-, everyone else: no access

SEE ALSO
       chown(1), ls(1)`,
};

const chown: CommandDefinition = {
  name: 'chown',
  async execute(args, ctx) {
    const ownerSpec = args[0];
    const path = args[1];
    if (!ownerSpec || !path) { ctx.out('chown: missing operand'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, path);

    let newOwner: string;
    let newGroup: string | null = null;

    if (ownerSpec.includes(':')) {
      const parts = ownerSpec.split(':');
      newOwner = parts[0] || ctx.user;
      newGroup = parts[1] || null;
    } else {
      newOwner = ownerSpec;
    }

    const ok = ctx.fs.chown(resolved, newOwner, newGroup, ctx.user, ctx.sudo);
    if (!ok) ctx.out(`chown: changing ownership of '${path}': Operation not permitted`);
  },
  man: `CHOWN(1)                     User Commands                    CHOWN(1)

NAME
       chown - change file owner and group

SYNOPSIS
       chown [OWNER][:[GROUP]] FILE

DESCRIPTION
       Change the owner and/or group of FILE. On most systems, only root
       (or sudo) can change file ownership.

       Ownership determines which permission set applies when a user
       accesses a file:
         - Owner matches  -> first octal digit applies
         - Group matches  -> second octal digit applies
         - Neither        -> third octal digit applies

       The colon syntax allows setting both owner and group at once.

EXAMPLES
       chown guest file.txt           Change owner to guest.
       chown guest:guest file.txt     Change owner and group.
       chown :wheel file.txt          Change only the group.
       sudo chown root:root /etc/conf Change owner and group to root.

SEE ALSO
       chmod(1), ls(1)`,
};

export const permissionsCommands: CommandDefinition[] = [chmod, chown];
