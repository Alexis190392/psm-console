export const confirmationRequiredActions = [
  'steamcmd:install',
  'steamcmd:repair',
  'server:install',
  'server:update',
  'server:repair',
  'server:start',
  'server:stop',
  'server:restart',
  'server:stop-query-port-owner',
  'server-idle:update-policy',
  'admin:execute-action',
  'config:save',
  'config:create-default',
  'config:restore-default',
  'firewall:create-rule',
  'backup:create-configuration',
  'backup:create-world',
  'backup:update-policy',
  'backup:restore',
  'backup:delete'
] as const;

export type ConfirmationRequiredAction = (typeof confirmationRequiredActions)[number];

export function requiresUserConfirmation(action: string): action is ConfirmationRequiredAction {
  return confirmationRequiredActions.includes(action as ConfirmationRequiredAction);
}
