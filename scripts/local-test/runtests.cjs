const pg=require('pg'); const fs=require('fs'); const path=require('path');
const DIR='/tmp/pgtest/tests';
(async()=>{
  const files=fs.readdirSync(DIR).filter(f=>/^\d+_.*\.sql$/.test(f)&&!/^00_/.test(f)).sort();
  const fixtures=fs.readFileSync(path.join(DIR,'00_fixtures.sql'),'utf8');
  let pass=0, fail=0, failed=[];
  for(const f of files){
    const c=new pg.Client({host:'/tmp',port:5433,user:'postgres',database:'hlbos'});
    await c.connect();
    await c.query(fixtures);
    let out;
    try { out = await c.query(fs.readFileSync(path.join(DIR,f),'utf8')); }
    catch(e){ console.log(`\n### ${f}\nSQL ERROR: ${e.message}`); fail++; await c.end(); continue; }
    const rows=[].concat(...out.filter(r=>r&&r.rows).map(r=>r.rows)).map(r=>Object.values(r)[0]).filter(v=>typeof v==='string');
    console.log(`\n### ${f}`);
    for(const line of rows){
      if(/^ok \d/.test(line)) { pass++; console.log('  '+line); }
      else if(/^not ok \d/.test(line)) { fail++; failed.push(f+': '+line); console.log('  '+line); }
      else if(line.trim().startsWith('#')) console.log('  '+line);
    }
    await c.end();
  }
  console.log('\n========================================');
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  if(failed.length){ console.log('\nFAILURES:'); failed.forEach(x=>console.log('  '+x)); }
  process.exit(fail?1:0);
})().catch(e=>{console.log('RUNNER ERR:',e.message);process.exit(1);});
