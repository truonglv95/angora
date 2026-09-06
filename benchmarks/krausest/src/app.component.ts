import { Component, signal } from '@angora-js/core';
import { buildData, type Row } from './store.ts';

@Component({
  selector: 'app-benchmark',
  template: `
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Angora Benchmark</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <button id="run" (click)="run()">Create 1,000 rows</button>
              <button id="runlots" (click)="runLots()">Create 10,000 rows</button>
              <button id="add" (click)="add()">Append 1,000 rows</button>
              <button id="update" (click)="update()">Update every 10th row</button>
              <button id="clear" (click)="clear()">Clear</button>
              <button id="swaprows" (click)="swapRows()">Swap Rows</button>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          @for (item of data(); track item.id) {
            <tr [class.danger]="item.id === selected()">
              <td class="col-md-1">{{ item.id }}</td>
              <td class="col-md-4">
                <a (click)="select(item.id)">{{ item.label }}</a>
              </td>
              <td class="col-md-1">
                <a (click)="delete(item.id)"
                  ><span class="glyphicon glyphicon-remove" aria-hidden="true"></span
                ></a>
              </td>
              <td class="col-md-6"></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class BenchmarkComponent {
  data = signal<Row[]>([]);
  selected = signal<number | null>(null);

  run() {
    this.data.set(buildData(1000));
    this.selected.set(null);
  }

  runLots() {
    this.data.set(buildData(10000));
    this.selected.set(null);
  }

  add() {
    this.data.update(d => [...d, ...buildData(1000)]);
  }

  update() {
    const list = this.data();
    const len = list.length;
    const updated = [...list];
    for (let i = 0; i < len; i += 10) {
      updated[i] = {
        id: updated[i].id,
        label: updated[i].label + ' !!!',
      };
    }
    this.data.set(updated);
  }

  clear() {
    this.data.set([]);
    this.selected.set(null);
  }

  swapRows() {
    const list = this.data();
    if (list.length > 998) {
      const copy = [...list];
      const tmp = copy[1];
      copy[1] = copy[998];
      copy[998] = tmp;
      this.data.set(copy);
    }
  }

  select(id: number) {
    this.selected.set(id);
  }

  delete(id: number) {
    this.data.update(d => d.filter(item => item.id !== id));
  }
}
