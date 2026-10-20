import {readdir, readFile, writeFile, mkdir, unlink, lstat} from 'node:fs/promises';
import {resolve, join, relative, isAbsolute, dirname} from 'node:path';
import {createHash} from 'node:crypto';

async function tree(root, prefix = '') {
  const files = new Map();
  let entries;
  try {
    if (!prefix && !(await lstat(root)).isDirectory()) throw new Error('Generated client root must be a real directory');
    entries = await readdir(join(root, prefix), {withFileTypes: true});
  }
  catch (error) { if (error.code === 'ENOENT' && !prefix) return files; throw error; }
  for (const entry of entries) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) for (const [path, bytes] of await tree(root, name)) files.set(path, bytes);
    else if (entry.isFile()) files.set(name, await readFile(join(root, name)));
    else throw new Error('Generated client contains an unsupported file type');
  }
  return files;
}
const digest = files => createHash('sha256').update([...files].sort(([a], [b]) => a.localeCompare(b))
  .map(([name, bytes]) => `${name}\0${createHash('sha256').update(bytes).digest('hex')}`).join('\n')).digest('hex');

// Prisma writes a tracked output directory. Restore only our own generation,
// including any pre-existing dirty/untracked bytes; never overwrite later edits.
export async function preserveGeneratedClient(directory, backup) {
  const root = resolve(directory), original = await tree(root);
  await mkdir(backup, {recursive: true});
  for (const [name, bytes] of original) {
    const target = join(backup, name); await mkdir(dirname(target), {recursive: true}); await writeFile(target, bytes);
  }
  let generatedDigest;
  return {
    async recordGenerated() { generatedDigest = digest(await tree(root)); },
    async restore() {
      if (!generatedDigest) throw new Error('Generated output was not recorded; backup retained');
      const current = await tree(root);
      if (digest(current) !== generatedDigest) throw new Error('Generated client changed concurrently; backup retained without overwriting edits');
      for (const [name, bytes] of original) {
        const target = join(root, name); await mkdir(dirname(target), {recursive: true}); await writeFile(target, bytes);
      }
      for (const name of current.keys()) if (!original.has(name)) {
        const target = resolve(root, name), inside = relative(root, target);
        if (isAbsolute(inside) || inside.startsWith('..') || !inside) throw new Error('Unsafe generated file cleanup path');
        await unlink(target);
      }
      if (digest(await tree(root)) !== digest(original)) throw new Error('Generated client restoration mismatch');
    },
  };
}
