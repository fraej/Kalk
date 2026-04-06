import { ComputeEngine } from 'https://esm.run/@cortex-js/compute-engine';
const ce = new ComputeEngine();
console.log(ce.parse('\\slash').json);
console.log(ce.parse('/').json);
console.log(ce.parse('{/}').json);
console.log('done');
