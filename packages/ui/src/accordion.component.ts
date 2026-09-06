import { Component, input } from '@angora-js/core';

/**
 * Angular-style Accordion Container Component (CdkAccordion equivalent)
 *
 * @example
 * <angora-accordion [multi]="false">
 *   <angora-accordion-item title="FAQ 1">...</angora-accordion-item>
 *   <angora-accordion-item title="FAQ 2">...</angora-accordion-item>
 * </angora-accordion>
 */
@Component({
  selector: 'angora-accordion',
  template: `
    <div class="angora-accordion">
      <ng-content></ng-content>
    </div>
  `,
})
export class AngoraAccordionComponent {
  multi = input<boolean>(false);
}
