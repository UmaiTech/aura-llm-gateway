/* Design fixture, not Aura's production classifier. See handoff/SOURCE_MAP.md. */
const AUTO_TIERS=['simple','medium','complex','reasoning'];
const AUTO_SCENARIOS=[
 {id:'rewrite',name:'Everyday rewrite',prompt:'Rewrite this sentence more clearly: our deployment is ready for review.',score:.08,signal:'Short rewrite · low complexity'},
 {id:'tools',name:'Tool-assisted task',prompt:'Use the available tools to look up the delivery status and summarize it.',score:.28,tools:true,signal:'Tool request · medium floor'},
 {id:'code',name:'Engineering analysis',prompt:'Debug this distributed service and explain the concurrency tradeoffs.',score:.50,signal:'Code and multi-step analysis'},
 {id:'proof',name:'Deep reasoning',prompt:'Prove the convergence of this iterative algorithm and derive its error bound.',score:.72,signal:'Proof and derivation markers'}
];
const AUTO_CATALOG=[
 ['gemini-3.1-flash-lite','Google','simple',.11],['gpt-5.6-luna','OpenAI','simple',.35],
 ['gpt-5.4-mini','OpenAI','medium',.80],['claude-haiku-4-5','Anthropic','medium',1.10],
 ['claude-sonnet-5','Anthropic','complex',3.20],['gemini-3-pro-preview','Google','complex',3.80],
 ['gpt-5.6-sol','OpenAI','reasoning',7.50],['claude-opus-5','Anthropic','reasoning',9.00]
].map(([model,provider,tier,price])=>({model,provider,tier,price}));
function simulateAuto({scenario='rewrite',mode='balanced',min='simple',max='reasoning',providers={OpenAI:true,Google:true,Anthropic:true},shadow=false,pinned='gpt-5.4-mini'}={}){
 const s=AUTO_SCENARIOS.find(x=>x.id===scenario)||AUTO_SCENARIOS[0];
 const score=Math.max(0,Math.min(1,s.score+({cost:-.10,balanced:0,quality:.15}[mode]||0)));
 const classified=score<.15?0:score<.35?1:score<.60?2:3;
 const lo=AUTO_TIERS.indexOf(min),hi=AUTO_TIERS.indexOf(max),floor=s.tools?Math.max(lo,1):lo;
 const target=Math.max(floor,Math.min(hi,classified));
 const filters=[...(s.tools?['needs tools','tools floor medium']:[]),...(lo?['min_tier '+min]:[]),...(hi<3?['max_tier '+max]:[])];
 const order=[target,...AUTO_TIERS.map((_,i)=>i).filter(i=>i>target&&i<=hi),...AUTO_TIERS.map((_,i)=>i).reverse().filter(i=>i<target&&i>=floor)];
 const candidates=AUTO_CATALOG.map(c=>({...c,eligible:!!providers[c.provider]&&AUTO_TIERS.indexOf(c.tier)>=floor&&AUTO_TIERS.indexOf(c.tier)<=hi,excluded:!providers[c.provider]?'Provider disabled':AUTO_TIERS.indexOf(c.tier)<floor||AUTO_TIERS.indexOf(c.tier)>hi?'Outside tier bounds':''}));
 let chosen=null;if(lo<=hi&&floor<=hi)for(const t of order){chosen=candidates.filter(c=>c.eligible&&c.tier===AUTO_TIERS[t]).sort((a,b)=>a.price-b.price)[0];if(chosen)break;}
 return {requested_model:shadow?pinned:'auto:'+mode,mode,classifier:'prototype-fixture',score,raw_score:s.score,classified_tier:AUTO_TIERS[classified],tier:chosen?.tier||AUTO_TIERS[target],boundaries:{simple_medium:.15,medium_complex:.35,complex_reasoning:.60},signals:{fixture_complexity:s.score},features:{fixture_scenario:s.id,tool_count:s.tools?1:0},hard_filters:filters,candidates:candidates.map(c=>({model:c.model,provider:c.provider.toLowerCase(),tier:c.tier,cost_per_million:c.price,eligible:c.eligible})),selected:chosen?.model||null,selected_provider:chosen?.provider.toLowerCase()||null,reason:chosen?`Cheapest eligible fixture in ${chosen.tier}${chosen.tier!==AUTO_TIERS[target]?' after tier fallback':''}.`:lo>hi?'Invalid tier bounds.':'No eligible model within the configured bounds.',shadow,fixture_signal:s.signal,fixture_candidates:candidates,error:chosen?null:'no_eligible_model',actual_model:shadow?pinned:chosen?.model};
}
