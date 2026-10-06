import { escapeHtml } from "../ui";

export function renderTimeReset(label: string, defaultValue?: string): string {
  const action = defaultValue === undefined ? "Clear" : "Reset";
  return `<button type="button" class="time-reset-button" data-action="reset-time" data-time-default="${escapeHtml(defaultValue ?? "")}" aria-label="${action} ${escapeHtml(label)}">${action}</button>`;
}

export function renderTimeField(params: {
  id: string;
  label: string;
  value: string | null;
  attributes: string;
  defaultValue?: string;
}): string {
  return `<div class="field time-control-field">
    <div class="time-field-heading"><label for="${escapeHtml(params.id)}">${escapeHtml(params.label)}</label>${renderTimeReset(params.label, params.defaultValue)}</div>
    <input id="${escapeHtml(params.id)}" type="time" value="${escapeHtml(params.value ?? "")}" ${params.attributes} />
  </div>`;
}
