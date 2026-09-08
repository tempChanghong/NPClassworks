// FIFO browser-lock fixture; unlike a no-op callback it exercises awaited writes.
export function createBrowserLocks() {
  const tails = new Map();
  return {
    async request(name, options, callback) {
      const prior = tails.get(name);
      if (options.ifAvailable && prior) return callback(null);
      let release;
      const held = new Promise(resolve => { release = resolve; });
      tails.set(name, held);
      await prior;
      try { return await callback({name}); }
      finally { if (tails.get(name) === held) tails.delete(name); release(); }
    },
  };
}
