begin;

insert into app_users(id,privy_did,display_name,role,created_at,last_seen_at)
values(
  '00000000-0000-4000-8000-000000000001',
  'did:privy:local-demo-user',
  'Demo Forecaster',
  'USER',
  '2026-09-01T00:00:00Z',
  '2026-09-01T00:00:00Z'
)
on conflict(id) do nothing;

insert into user_wallets(id,user_id,address,privy_verified,verified_at,created_at)
values(
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '0x1111111111111111111111111111111111111111',
  true,
  '2026-09-01T00:00:00Z',
  '2026-09-01T00:00:00Z'
)
on conflict(id) do nothing;

insert into markets(
  id,slug,chain_id,question,description,category,resolution_source,rules,
  metadata_uri,metadata_hash,close_time,status,mechanism_version,fee_bps,
  yes_probability_bps,volume,confirmed_block,canonical,data_origin,demo_liquidity,created_at
)
values
  ('00000000-0000-4000-8000-000000000101','fed-cuts-2026',80002,'美联储会在 2026 年 12 月前累计降息至少 50 个基点吗？','市场衡量美联储在 2026 年内是否会累计下调联邦基金目标利率区间至少 50 个基点。','Politics','https://example.invalid/resolution/fed-cuts-2026','正式生效的 FOMC 决议累计降息至少 50 个基点则为 YES，否则为 NO。','https://example.invalid/markets/fed-cuts-2026.json','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-12-16T19:00:00Z','OPEN',1,100,6800,12840000000000,null,true,'DEMO',2460000000000,'2026-07-18T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000102','eth-6000-2026',80002,'ETH 会在 2026 年结束前触及 6,000 美元吗？','预测 ETH/USD 是否会在 2026 年结束前达到指定价格。','Crypto','https://example.invalid/resolution/eth-6000-2026','指定公开价格源在截止时间前达到或超过 6,000 美元则为 YES，否则为 NO。','https://example.invalid/markets/eth-6000-2026.json','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','2026-12-31T15:59:00Z','OPEN',1,100,4100,9620500000000,null,true,'DEMO',1980000000000,'2026-08-02T03:30:00Z'),
  ('00000000-0000-4000-8000-000000000103','ai-benchmark-2027',80002,'下一代通用 AI 推理基准会在 2027 年前突破 90% 吗？','预测公开发布的通用人工智能系统是否会在约定推理基准上首次突破 90%。','Technology','https://example.invalid/resolution/ai-benchmark-2027','基准维护方正式发布且可复核的合格系统成绩达到或超过 90% 则为 YES。','https://example.invalid/markets/ai-benchmark-2027.json','0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2027-01-31T12:00:00Z','OPEN',1,100,5700,7415200000000,null,true,'DEMO',1240000000000,'2026-07-29T12:15:00Z'),
  ('00000000-0000-4000-8000-000000000104','artemis-lunar-flyby',80002,'Artemis II 会在 2027 年 6 月前完成载人绕月飞行吗？','预测 Artemis II 是否会在市场截止日前完成载人绕月飞行。','Technology','https://example.invalid/resolution/artemis-lunar-flyby','NASA 正式确认完成载人绕月轨迹并安全结束任务则为 YES。','https://example.invalid/markets/artemis-lunar-flyby.json','0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','2027-06-30T10:00:00Z','OPEN',1,100,7400,4280900000000,null,true,'DEMO',3120000000000,'2026-08-11T06:20:00Z'),
  ('00000000-0000-4000-8000-000000000105','womens-world-cup-europe',80002,'2027 年女足世界杯冠军会来自欧洲足联吗？','预测 2027 年女足世界杯冠军是否来自欧洲足联成员协会。','Sports','https://example.invalid/resolution/womens-world-cup-europe','FIFA 确认的冠军协会属于 UEFA 则为 YES，否则为 NO。','https://example.invalid/markets/womens-world-cup-europe.json','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','2027-07-25T14:00:00Z','OPEN',1,100,6100,1105400000000,null,true,'DEMO',860000000000,'2026-09-01T10:05:00Z'),
  ('00000000-0000-4000-8000-000000000106','renewable-capacity-2027',80002,'2027 年全球新增可再生能源装机量会超过 900GW 吗？','预测 2027 年全球新增可再生能源装机是否会突破 900GW。','Politics','https://example.invalid/resolution/renewable-capacity-2027','指定国际能源统计机构最终数据达到或超过 900GW 则为 YES。','https://example.invalid/markets/renewable-capacity-2027.json','0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff','2027-12-31T04:00:00Z','OPEN',1,100,5200,860700000000,null,true,'DEMO',740000000000,'2026-09-02T04:45:00Z'),
  ('00000000-0000-4000-8000-000000000107','international-film-oscar-2027',80002,'2027 年奥斯卡最佳影片得主会是一部非英语电影吗？','预测 2027 年奥斯卡最佳影片获奖作品是否为主要非英语对白影片。','Culture','https://example.invalid/resolution/international-film-oscar-2027','最佳影片获奖作品主要对白语言为非英语则为 YES，否则为 NO。','https://example.invalid/markets/international-film-oscar-2027.json','0x9999999999999999999999999999999999999999999999999999999999999999','2027-03-15T04:00:00Z','OPEN',1,100,3600,540300000000,null,true,'DEMO',690000000000,'2026-09-03T09:30:00Z')
on conflict(id) do update set
  slug=excluded.slug,
  question=excluded.question,
  description=excluded.description,
  category=excluded.category,
  resolution_source=excluded.resolution_source,
  rules=excluded.rules,
  metadata_uri=excluded.metadata_uri,
  metadata_hash=excluded.metadata_hash,
  close_time=excluded.close_time,
  status=excluded.status,
  yes_probability_bps=excluded.yes_probability_bps,
  volume=excluded.volume,
  demo_liquidity=excluded.demo_liquidity
where markets.data_origin = 'DEMO';

insert into market_outcomes(market_id,side)
select market_id,side
from (values
  ('00000000-0000-4000-8000-000000000101'::uuid,'YES'),('00000000-0000-4000-8000-000000000101'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000102'::uuid,'YES'),('00000000-0000-4000-8000-000000000102'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000103'::uuid,'YES'),('00000000-0000-4000-8000-000000000103'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000104'::uuid,'YES'),('00000000-0000-4000-8000-000000000104'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000105'::uuid,'YES'),('00000000-0000-4000-8000-000000000105'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000106'::uuid,'YES'),('00000000-0000-4000-8000-000000000106'::uuid,'NO'),
  ('00000000-0000-4000-8000-000000000107'::uuid,'YES'),('00000000-0000-4000-8000-000000000107'::uuid,'NO')
) as outcomes(market_id,side)
on conflict(market_id,side) do nothing;

insert into demo_probability_history(market_id,sequence,observed_at,yes_probability_bps)
values
  ('00000000-0000-4000-8000-000000000101',0,'2026-07-18T08:00:00Z',5100),('00000000-0000-4000-8000-000000000101',1,'2026-08-09T08:00:00Z',5300),('00000000-0000-4000-8000-000000000101',2,'2026-09-04T08:00:00Z',6800),
  ('00000000-0000-4000-8000-000000000102',0,'2026-07-18T08:00:00Z',4800),('00000000-0000-4000-8000-000000000102',1,'2026-08-09T08:00:00Z',4400),('00000000-0000-4000-8000-000000000102',2,'2026-09-04T08:00:00Z',4100),
  ('00000000-0000-4000-8000-000000000103',0,'2026-07-18T08:00:00Z',4500),('00000000-0000-4000-8000-000000000103',1,'2026-08-09T08:00:00Z',5400),('00000000-0000-4000-8000-000000000103',2,'2026-09-04T08:00:00Z',5700),
  ('00000000-0000-4000-8000-000000000104',0,'2026-07-18T08:00:00Z',5900),('00000000-0000-4000-8000-000000000104',1,'2026-08-09T08:00:00Z',6500),('00000000-0000-4000-8000-000000000104',2,'2026-09-04T08:00:00Z',7400),
  ('00000000-0000-4000-8000-000000000105',0,'2026-07-18T08:00:00Z',5800),('00000000-0000-4000-8000-000000000105',1,'2026-08-09T08:00:00Z',5700),('00000000-0000-4000-8000-000000000105',2,'2026-09-04T08:00:00Z',6100),
  ('00000000-0000-4000-8000-000000000106',0,'2026-07-18T08:00:00Z',4900),('00000000-0000-4000-8000-000000000106',1,'2026-08-09T08:00:00Z',4800),('00000000-0000-4000-8000-000000000106',2,'2026-09-04T08:00:00Z',5200),
  ('00000000-0000-4000-8000-000000000107',0,'2026-07-18T08:00:00Z',3100),('00000000-0000-4000-8000-000000000107',1,'2026-08-09T08:00:00Z',3000),('00000000-0000-4000-8000-000000000107',2,'2026-09-04T08:00:00Z',3600)
on conflict(market_id,sequence) do update set
  observed_at=excluded.observed_at,
  yes_probability_bps=excluded.yes_probability_bps;

insert into simulation_orders(
  id,user_id,wallet_address,market_id,side,amount,execution_price_bps,
  estimated_shares,potential_payout,idempotency_key,request_hash,created_at
)
values(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  '0x1111111111111111111111111111111111111111',
  '00000000-0000-4000-8000-000000000101',
  'YES',100000000,6800,147058823,147058823,
  'mvp-demo-seed-order',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '2026-09-04T08:00:00Z'
)
on conflict(user_id,idempotency_key) do nothing;

commit;
