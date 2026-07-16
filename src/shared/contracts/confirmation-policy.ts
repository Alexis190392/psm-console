export const confirmationRequiredActions = [
  'steamcmd:install',
  'steamcmd:repair',
  'server:install',
  'server:repair',
  'server:update',
  'server:start',
  'server:stop',
  'server:restart',
  'config:save',
  'config:create-default',
  'firewall:create-rule',
  'firewall:update-rule',
  'firewall:remove-rule',
  'backup:create',
  'backup:restore',
  'backup:delete'
] as const;

export type ConfirmationRequiredAction = (typeof confirmationRequiredActions)[number];

export function requiresUserConfirmation(action: string): action is ConfirmationRequiredAction {
  return confirmationRequiredActions.includes(action as ConfirmationRequiredAction);
}
