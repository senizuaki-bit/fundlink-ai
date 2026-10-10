import assert from 'node:assert/strict';
import {modelConfig, modelStatus, modelAnswer, ModelServiceError} from '../lib/ai-provider.ts';

const testEnv = {DEEPSEEK_API_KEY:'test-private-key', OPENAI_API_KEY:'test-openai-key'};
const config = modelConfig(testEnv);
assert.equal(config.provider, 'DeepSeek');
assert.equal(modelConfig({OPENAI_API_KEY:'test'}).provider, 'OpenAI');
assert.equal(modelConfig({DEEPSEEK_API_KEY:'  '}), null);
assert.deepEqual(modelStatus(testEnv), {mode:'model',provider:'DeepSeek',model:'deepseek-flash'});
assert.equal(JSON.stringify(modelStatus(testEnv)).includes('key'), false);
assert.equal(modelStatus({}).mode, 'demo');
const answer = await modelAnswer(config, [{role:'user', content:'Hello'}], async (url, options) => {
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-private-key');
  assert.equal(JSON.parse(options.body).thinking.type, 'disabled');
  return Response.json({choices:[{message:{content:'connected'}}]});
});
assert.equal(answer, 'connected');
for (const [status, text] of [[401,'密钥'],[402,'余额'],[429,'频繁'],[500,'暂不可用']]) {
  await assert.rejects(() => modelAnswer(config, [], async () => new Response('sensitive upstream details', {status})), error => {
    assert.ok(error instanceof ModelServiceError);
    assert.ok(error.message.includes(text));
    assert.ok(!error.message.includes('sensitive'));
    return true;
  });
}
await assert.rejects(() => modelAnswer(config, [], async () => Response.json({choices:[]})), /有效内容/);
await assert.rejects(() => modelAnswer(config, [], async () => {throw new DOMException('timeout','TimeoutError')}), /超时/);
console.log('PASS: provider selection, secret-free metadata, request format, sanitized errors, empty reply and timeout');

const base = process.env.FUNDLINK_TEST_URL;
if (base) {
  assert.equal((await fetch(base+'/api/agent?role=investor')).status, 401);
  const login = await fetch(base+'/signin-with-chatgpt?return_to=/', {redirect:'manual'});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = {cookie,'Content-Type':'application/json'};
  const metadata = await fetch(base+'/api/agent?role=investor', {headers}).then(r=>r.json());
  assert.equal(metadata.provider, 'DeepSeek');
  assert.deepEqual(Object.keys(metadata).sort(), ['mode','model','provider']);
  const wrongOrigin = await fetch(base+'/api/agent?role=investor', {method:'POST',headers:{...headers,Origin:'https://wrong.example'},body:JSON.stringify({prompt:'test'})});
  assert.equal(wrongOrigin.status,403);
  const result = await fetch(base+'/api/agent?role=investor', {method:'POST',headers,body:JSON.stringify({prompt:'这是连接测试，只回复：DeepSeek 连接成功。'})});
  const data = await result.json();
  assert.equal(result.status, 200, JSON.stringify(data));
  assert.equal(data.mode, 'model');
  assert.equal(data.provider, 'DeepSeek');
  assert.ok(data.content.length > 0);
  console.log(JSON.stringify({result:'PASS: authenticated live DeepSeek reply; no workspace mutation',provider:data.provider,model:data.model,reply:data.content}));
}
