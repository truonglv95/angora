import { Component, input, output, signal, computed } from '@angora-js/core';

export interface SelectOption {
  label: string;
  value: any;
}

@Component({
  selector: 'angora-select',
  template: `
    <div class="angora-select" [class.open]="isOpen()">
      <button
        type="button"
        class="angora-select-trigger"
        aria-haspopup="listbox"
        [attr.aria-expanded]="isOpen() ? 'true' : 'false'"
        (click)="toggle()"
      >
        <span>{{ selectedLabel() }}</span>
      </button>

      @if (isOpen()) {
        <ul
          class="angora-select-dropdown"
          role="listbox"
          tabindex="-1"
          (keydown)="handleKeyDown($event)"
        >
          @for (opt of options(); track opt.value) {
            <li
              role="option"
              class="angora-select-option"
              [class.selected]="value() === opt.value"
              [attr.aria-selected]="value() === opt.value ? 'true' : 'false'"
              (click)="select(opt)"
            >
              {{ opt.label }}
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .angora-select {
        position: relative;
        display: inline-block;
        width: 100%;
        min-width: 140px;
      }
      .angora-select-trigger {
        width: 100%;
        padding: 8px 12px;
        text-align: left;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: white;
        cursor: pointer;
      }
      .angora-select-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        z-index: 50;
        max-height: 200px;
        overflow-y: auto;
      }
      .angora-select-option {
        padding: 8px 12px;
        cursor: pointer;
      }
      .angora-select-option:hover {
        background: #f8fafc;
      }
      .angora-select-option.selected {
        background: #e0e7ff;
        font-weight: 600;
      }
    `,
  ],
})
export class AngoraSelectComponent {
  options = input<SelectOption[]>([]);
  value = input<any>(null);
  placeholder = input<string>('Select an option');
  valueChange = output<any>();

  isOpen = signal<boolean>(false);

  selectedLabel = computed(() => {
    const currentVal = this.value();
    const found = this.options().find(o => o.value === currentVal);
    return found ? found.label : this.placeholder();
  });

  toggle() {
    this.isOpen.update(v => !v);
  }

  select(opt: SelectOption) {
    this.valueChange.emit(opt.value);
    this.isOpen.set(false);
  }

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.isOpen.set(false);
    }
  }
}
