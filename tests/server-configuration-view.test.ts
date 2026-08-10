import { describe, expect, it } from 'vitest';
import { parsePalworldSettings } from '../src/renderer/config/palworld-settings-parser';
import {
  renderConfigurationPresets,
  renderSettingsFilterBar,
  renderSettingsForm
} from '../src/renderer/views/server-configuration-view';

describe('server configuration view', () => {
  const parsed = parsePalworldSettings(
    'OptionSettings=(Difficulty=None,bIsMultiplay=True,DayTimeSpeedRate=1.000000,ServerName="Servidor <QA>")'
  );

  it('renders presets and category filters from parsed settings', () => {
    const html = `${renderConfigurationPresets()}${renderSettingsFilterBar(parsed)}`;

    expect(html).toContain('data-preset="casual"');
    expect(html).toContain('id="settings-search"');
    expect(html).toContain('4 parametros');
  });

  it('renders select, switch, range and escaped text controls', () => {
    const html = renderSettingsForm(parsed);

    expect(html).toContain('<details class="settings-group">');
    expect(html).not.toContain('<details class="settings-group" open>');
    expect(html).toContain('<small data-group-count>');
    expect(html).toContain('data-setting-key="Difficulty"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('data-range-key="DayTimeSpeedRate"');
    expect(html).toContain('Servidor &lt;QA&gt;');
    expect(html).not.toContain('Servidor <QA>');
  });

  it('renders a disabled zero-value switch and hides its numeric control', () => {
    const zeroParsed = parsePalworldSettings(
      'OptionSettings=(PalEggDefaultHatchingTime=0.000000,BuildObjectDamageRate=1.000000)'
    );
    const html = renderSettingsForm(zeroParsed);

    expect(html).toContain('data-zero-toggle-key="PalEggDefaultHatchingTime"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-zero-value-key="PalEggDefaultHatchingTime" hidden');
    expect(html).toContain('value="1.000000"');
    expect(html).toContain('data-zero-toggle-key="BuildObjectDamageRate"');
    expect(html).toContain('aria-checked="true"');
  });

  it('keeps ordinary numeric settings without the zero-value switch', () => {
    const html = renderSettingsForm(parsePalworldSettings('OptionSettings=(DayTimeSpeedRate=1.000000)'));

    expect(html).not.toContain('data-zero-toggle-key="DayTimeSpeedRate"');
    expect(html).toContain('data-range-key="DayTimeSpeedRate"');
  });
});
