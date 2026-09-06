import { Component, input, output } from '@angora-js/core';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

@Component({
  selector: 'app-todo-item',
  template: `
    <li class="todo-item">
      <span [style.textDecoration]="item().completed ? 'line-through' : 'none'">
        {{ item().text }}
      </span>
      <div class="item-actions">
        <button (click)="toggle.emit(item().id)">Toggle</button>
        <button (click)="remove.emit(item().id)">Delete</button>
      </div>
    </li>
  `,
})
export class TodoItemComponent {
  item = input.required<Todo>();
  toggle = output<number>();
  remove = output<number>();
}
