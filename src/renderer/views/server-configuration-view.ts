import { CONFIGURATION_PRESETS } from '../config/configuration-presets';
import type { PalworldSettingDefinition } from '../config/palworld-settings-catalog';
import { formatSelectOptionLabel, getSettingDefinition } from '../config/setting-definition-resolver';
import {
  unquoteSettingValue,
  type ParsedPalworldSetting,
  type ParsedPalworldSettings
} from '../config/palworld-settings-parser';
import { renderIcon } from '../components/icon';
import { escapeHtml, normalizeSearchText } from '../utils/text';

export function renderConfigurationPresets(): string {
  return `
    <details class="preset-bar" aria-label="Perfiles rapidos de configuracion">
      <summary>
        <span>Perfiles rapidos</span>
        <small>Preparan el formulario sin guardar</small>
      </summary>
      <div class="preset-bar__actions">
        ${CONFIGURATION_PRESETS.map((preset) => `<button class="secondary-button preset-button" type="button" data-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>`).join('')}
      </div>
    </details>
  `;
}

export function renderSettingsFilterBar(parsed: ParsedPalworldSettings): string {
  const categories = Array.from(groupSettings(parsed.settings).keys());
  return `
    <section class="settings-filter" aria-label="Filtros de parametros del INI">
      <strong class="settings-filter__head">Parametros</strong>
      <div class="settings-filter__controls">
        <label class="settings-filter__search" for="settings-search">
          ${renderIcon('search')}
          <input id="settings-search" type="search" placeholder="Nombre, clave o descripcion" autocomplete="off" />
        </label>
        <label class="settings-filter__category" for="settings-category">
          <span>Categoria</span>
          <select id="settings-category">
            <option value="all">Todas</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
          </select>
        </label>
        <span id="settings-filter-count" class="settings-filter__count">${String(parsed.settings.length)} parametros</span>
      </div>
    </section>
  `;
}

export function renderSettingsForm(parsed: ParsedPalworldSettings): string {
  return Array.from(groupSettings(parsed.settings).entries())
    .map(
      ([group, settings]) => `
        <section class="settings-group">
          <h4>${escapeHtml(group)} <span data-group-count>${String(settings.length)}</span></h4>
          <div class="settings-grid">${settings.map(renderSettingControl).join('')}</div>
        </section>
      `
    )
    .join('');
}

function groupSettings(settings: ParsedPalworldSetting[]): Map<string, ParsedPalworldSetting[]> {
  const grouped = new Map<string, ParsedPalworldSetting[]>();
  settings.forEach((setting) => {
    const group = getSettingDefinition(setting.key, setting.value).group;
    grouped.set(group, [...(grouped.get(group) ?? []), setting]);
  });
  return grouped;
}

function renderSettingControl(setting: ParsedPalworldSetting): string {
  const definition = getSettingDefinition(setting.key, setting.value);
  const rawValue = unquoteSettingValue(setting.value);
  const info = `${definition.help}${definition.range ? ` Rango: ${definition.range}` : ''}`;
  const searchText = [
    definition.group,
    definition.label,
    setting.key,
    definition.help,
    definition.range ?? ''
  ].join(' ');

  return `
    <article class="setting-field" data-setting-card data-setting-card-key="${escapeHtml(setting.key)}" data-setting-group="${escapeHtml(definition.group)}" data-search="${escapeHtml(normalizeSearchText(searchText))}">
      <span class="setting-field__top">
        <span><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(setting.key)}</small></span>
        <button class="setting-info" type="button" aria-label="${escapeHtml(info)}" data-info="${escapeHtml(info)}">i</button>
      </span>
      ${renderSettingInput(definition, setting.key, rawValue)}
    </article>
  `;
}

function renderSettingInput(definition: PalworldSettingDefinition, key: string, value: string): string {
  if (definition.kind === 'boolean') {
    const isChecked = value.toLowerCase() === 'true';
    return `
      <button class="setting-toggle" data-setting-key="${escapeHtml(key)}" type="button" role="switch" aria-checked="${isChecked ? 'true' : 'false'}">
        <span class="setting-toggle__track" aria-hidden="true"><span></span></span>
        <span class="setting-toggle__state">${isChecked ? 'Activo' : 'Inactivo'}</span>
      </button>
    `;
  }
  if (definition.kind === 'select' && definition.options) {
    return `
      <select data-setting-key="${escapeHtml(key)}">
        ${definition.options
          .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(formatSelectOptionLabel(option))}</option>`)
          .join('')}
      </select>
    `;
  }
  if (definition.kind === 'number') {
    const numericValue = Number(value);
    if (typeof definition.min === 'number' && typeof definition.max === 'number' && Number.isFinite(numericValue)) {
      return `
        <span class="setting-range">
          <input data-range-key="${escapeHtml(key)}" type="range" min="${String(definition.min)}" max="${String(definition.max)}" step="${String(definition.step ?? 'any')}" value="${escapeHtml(value)}" />
          <input class="setting-range__value" data-setting-key="${escapeHtml(key)}" type="number" min="${String(definition.min)}" max="${String(definition.max)}" step="${String(definition.step ?? 'any')}" value="${escapeHtml(value)}" />
        </span>
      `;
    }
    return `<input data-setting-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(value)}" />`;
  }
  return `<input data-setting-key="${escapeHtml(key)}" type="text" value="${escapeHtml(value)}" />`;
}
