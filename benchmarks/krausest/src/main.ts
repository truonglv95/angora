import { bootstrapApplication } from '@angora-js/runtime';
import { BenchmarkComponent } from './app.component.ts';

const host = document.getElementById('main') || document.body;
bootstrapApplication(BenchmarkComponent, host);
