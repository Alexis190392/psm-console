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

    expect(html).toContain('data-setting-key="Difficulty"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('data-range-key="DayTimeSpeedRate"');
    expect(html).toContain('Servidor &lt;QA&gt;');
    expect(html).not.toContain('Servidor <QA>');
  });
});
