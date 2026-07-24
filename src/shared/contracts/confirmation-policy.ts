export const confirmationRequiredActions = [
  'steamcmd:install',
  'server:install',
  'server:update',
  'server:start',
  'server:stop',
  'admin:execute-action',
  'config:save',
  'config:create-default',
  'config:restore-default',
  'firewall:create-rule',
  'backup:create-configuration',
  'backup:create-world',
  'backup:restore',
  'backup:delete'
] as const;

export type ConfirmationRequiredAction = (typeof confirmationRequiredActions)[number];

export function requiresUserConfirmation(action: string): action is ConfirmationRequiredAction {
  return confirmationRequiredActions.includes(action as ConfirmationRequiredAction);
}
