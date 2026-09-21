// Isolated template/static-file verification; no backend, database or deployment.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const kv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../NPClassworksKV');
const require = createRequire(path.join(kv, 'package.json'));
const express = require('express');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(kv, 'views'));
app.use(express.static(path.join(kv, 'public')));
app.get('/', (req, res) => res.render('index'));
app.listen(4183, '127.0.0.1', () => console.log('KV template/static fixture: http://127.0.0.1:4183'));
