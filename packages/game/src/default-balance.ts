// The only runtime loader of balance.json. Game server and client use it; Studio, Engine and the simulator must not.
// Icons load separately (client only), so saving icons never restarts the server.
import balanceJson from '../../../content/balance.json' with { type: 'json' };
import { Balance } from './content-schema.ts';
import { createRules } from './rules.ts';

let parsed: Balance;
try { parsed = Balance.parse(balanceJson); }
catch (e) { throw new Error(`content/balance.json is invalid. Fix it in the Studio or by hand.\n${e instanceof Error ? e.message : e}`); }
export const defaultBalance = parsed;
export const defaultRules = createRules(defaultBalance);
