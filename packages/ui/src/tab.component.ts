import { Component, input, signal } from '@angora-js/core';

/**
 * Angular-style Tab Component
 *
 * @example
 * <angora-tab label="Overview">
 *   <p>Overview Content</p>
 * </angora-tab>
 */
@Component({
  selector: 'angora-tab',
  template: `
    @if (active()) {
      <div role="tabpanel" class="angora-tab-content">
        <ng-content></ng-content>
      </div>
    }
  `,
})
export class AngoraTabComponent {
  label = input<string>('');
  active = signal<boolean>(false);
}
