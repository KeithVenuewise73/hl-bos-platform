-- hlbos_0045: say which population the pain evidence actually came from
--
-- The pain portfolio was labelled "Public Pain Points & Unmet Needs", which
-- reads as a claim about the public. It is not one. Every signal behind it came
-- from GitHub issues, and the top contributing repositories are AI coding
-- tools, language runtimes and editors -- developers writing about developer
-- tooling.
--
-- The clustering is sound and the evidence is real. What was wrong is the
-- billing: presenting one population as the public. The label now names the
-- population, so nobody has to remember the caveat to read the page correctly.
--
-- A MARKET NEED -- a problem confirmed across independent sources and different
-- kinds of people -- is a stronger claim than this evidence can support.
-- vstudio.market_needs exists and stays deliberately empty until it can.
--
-- rollback:
--   update vstudio.portfolios set
--     label = 'Public Pain Points & Unmet Needs',
--     description = 'Recurring problems people are publicly asking someone to solve, clustered from real evidence. Ranks pain clusters rather than repositories; every cluster is traceable to signals with public URLs.'
--   where key = 'pain';

update vstudio.portfolios
   set label = 'Initial Pain Evidence — GitHub Issues',
       description =
         'Recurring problems raised in public GitHub issues, clustered from real evidence with a public URL behind every signal. '
         || 'POPULATION: developers and technical users writing about developer tooling — this is one source and one population, not the public market. '
         || 'These clusters are evidence that will feed Market Needs; they are not themselves market needs, and they are not ranked as a Top 100. '
         || 'Broader populations (Reddit, app-store reviews, forums) are listed on the Sources page with the specific obstacle blocking each one.'
 where key = 'pain';
