import assert from 'node:assert/strict';
import {defaultWatchSchedule,scheduleInput,nextWatchTime,runnerAvailable} from '../lib/watch-schedule.ts';
assert.equal(defaultWatchSchedule().enabled,false);
assert.deepEqual(scheduleInput({enabled:true,intervalHours:6,entityIds:['a','a','b']}),{enabled:true,intervalHours:6,entityIds:['a','b']});
for(const input of [null,{}, {enabled:true,intervalHours:6,entityIds:[]},{enabled:true,intervalHours:0,entityIds:['a']},{enabled:true,intervalHours:24,entityIds:[1]}, {enabled:true,intervalHours:1,entityIds:Array.from({length:7},(_,i)=>String(i))}])assert.throws(()=>scheduleInput(input));
assert.equal(scheduleInput({enabled:false,intervalHours:24,entityIds:[]}).enabled,false);
assert.equal(nextWatchTime('2026-10-10T00:00:00.000Z',6),'2026-10-10T06:00:00.000Z');
const now=Date.parse('2026-10-10T00:00:00.000Z');assert.equal(runnerAvailable(new Date(now-60_000).toISOString(),now),true);assert.equal(runnerAvailable(new Date(now-160_000).toISOString(),now),false);assert.equal(runnerAvailable(null,now),false);
console.log('PASS: schedule opt-in, scope validation, bounded cadence, and heartbeat freshness');
