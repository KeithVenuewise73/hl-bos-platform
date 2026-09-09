do $do$
declare
  v_tenant uuid := '8a669381-1756-4231-949f-26954f2281e3';
  v_user   uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  -- One line per shop, tilde-separated, in sheet order:
  --   name~address~city~state~zip~phone~website-or-web-presence-note
  v_raw text := '88 South Barbershop~219 Orchard Park Rd~West Seneca~NY~14224~716-322-5595~No dedicated website confirmed
Burns Barber Shop~1030 Union Rd~West Seneca~NY~14224~716-674-1651~https://www.burnsbarbershop.com/
Truth Barbershop~2476 Seneca St~West Seneca~NY~14210~716-939-3443~https://truthbarbershop.glossgenius.com/about
Armstrong''s Barber Shop~2852 Seneca St~West Seneca~NY~14224~716-248-2842~https://www.armstrongsbarbershop.com
Tony''s Hair Styling~3606 Seneca St~Buffalo / West Seneca~NY~14224~716-771-1880~No dedicated website confirmed
Queen City Cuts~1016 Cleveland Dr~Cheektowaga~NY~14225~716-631-5636~No dedicated website confirmed
GPC Barbershop~2511 Harlem Rd~Buffalo / Cheektowaga~NY~14225~716-348-1357~No dedicated website confirmed
Buffalo Barber Society~1401 Niagara Falls Blvd~Amherst~NY~14226~716-240-9271~https://www.buffalobarbersociety.com/
Pieroni Barber Studio~1580 Eggert Rd~Amherst~NY~14226~716-381-6122~https://pieronibarberstudio.com/
University Barbershop & S.M.P~3520 Main St Ste 450~Amherst~NY~14226~716-544-9599~No dedicated website confirmed
Il Mulino Barbershop | Downtown Buffalo~465 Washington St~Buffalo~NY~14203~716-954-2981~No dedicated website confirmed
Dark Horse Barber Studio - Downtown~1155 Main St Ste 100~Buffalo~NY~14209~716-431-9007~https://darkhorsebarberstudio.com/
Cove & Mill Barbering Co.~50 Elk St Ste 120~Buffalo~NY~14210~716-625-2683~No dedicated website confirmed
Detailers Barbershop~76 Allen St~Buffalo~NY~14202~716-545-5800~No dedicated website confirmed
The Salty Dog Barbershop~268 Main St #100~Buffalo~NY~14202~716-776-9447~No dedicated website confirmed
House of Masters Grooming Lounge~846 Main St~Buffalo~NY~14202~716-381-8536~No dedicated website confirmed
Jayz House Of Fadez Barbershop~4216 Union Rd~Cheektowaga~NY~14225~716-248-5593~No dedicated website confirmed
Slawich Cut N'' Shave - Amherst~489 W Klein Rd~Amherst~NY~14221~716-932-7005~https://slawichcutnshave.com/
Dark Horse Barber Studio - East Aurora~580 Main St~East Aurora~NY~14052~716-507-3645~https://darkhorsebarberstudio.com/
Andrews'' Barber Parlor~191 Main St~East Aurora~NY~14052~716-714-9811~No dedicated website confirmed
Atlas Barber Co.~5748 S Transit Rd~Lockport~NY~14094~716-302-3845~No dedicated website confirmed
Adam''s Barber Shop~2936 Southwestern Blvd~Orchard Park~NY~14127~Not listed~No dedicated website confirmed
Pagans Barber Suite~1 East Ave Ste 103~Lockport~NY~14094~716-345-8938~Square booking site / dedicated domain not confirmed
Jay''s Barber Shop~235 Buffalo St~Hamburg~NY~14075~716-202-1082~No dedicated website confirmed
Off The Top Barber & Styling Co~503 3rd St~Niagara Falls~NY~14301~716-524-2001~No dedicated website confirmed
Ron''s Place For Hair~2910 Pine Ave~Niagara Falls~NY~14301~716-284-2072~No dedicated website confirmed
Sanitary Barbershop~151 West Ave~Lockport~NY~14094~716-433-3475~No dedicated website confirmed
Pj''s Barber Shop~3900 Southwestern Blvd~Orchard Park~NY~14127~716-289-7993~No dedicated website confirmed
Jimmy the Barber~6862 Akron Rd~Lockport~NY~14094~716-622-3566~No dedicated website confirmed
Bob''s Barber Shop~368 East Ave~Lockport~NY~14094~716-434-5650~No dedicated website confirmed
Hamburg Barber Shop~84 Lake St #4834~Hamburg~NY~14075~716-646-3062~No dedicated website confirmed
Gary''s Barber Shop~4329 S Buffalo St~Orchard Park~NY~14127~716-662-3337~No dedicated website confirmed
Locals Barbershop and Salon~2220 Southwestern Blvd~West Seneca / Orchard Park~NY~14224~719-321-0502~Vistaprint/booking presence reported; dedicated domain not confirmed
Jonathan Barber Shop~6032 Old Beattie Rd~Lockport~NY~14094~787-619-9885~No dedicated website confirmed
Hamburg Barber Company~6000 South Park Ave~Hamburg~NY~14075~716-907-3678~No dedicated website confirmed
Heartfelt Cutz Barbershop~4565 Clark St~Hamburg~NY~14075~716-926-9005~Booksy presence; dedicated site not confirmed
Studio 15;~27 High St~Lockport~NY~14094~716-302-9582~Square booking presence; dedicated site not confirmed
Slawich Cut N'' Shave - North Tonawanda~3571 Niagara Falls Blvd~North Tonawanda~NY~14120~716-957-3002~https://slawichcutnshave.com/
The 3 Dog Barber~30 Central Ave~Lancaster~NY~14086~716-288-7513~No dedicated website confirmed
Blended Barber Co~4928 Broadway~Depew~NY~14043~716-808-4777~No dedicated website confirmed
Al''s Quality Barber Shop~2640 George Urban Blvd~Depew~NY~14043~Not listed~No dedicated website confirmed
SevenOneSlicks~4522 Broadway~Depew~NY~14043~716-288-4523~No dedicated website confirmed
Old Soul Barbershop~4981 Broadway~Depew~NY~14043~716-288-7170~No dedicated website confirmed
Troy''s Barber Shop~1710 South Park Ave~Buffalo~NY~14220~716-444-5485~No dedicated website confirmed
Steven''s Barbershop~221 Aurora St~Lancaster~NY~14086~716-220-2202~No dedicated website confirmed
Straight Blades and Fades Barbershop~431 Terrace Blvd~Depew~NY~14043~716-420-8128~Booking-platform presence; dedicated site not confirmed
Legacy Barbershop~711 Oliver St~North Tonawanda~NY~14120~716-622-3368~https://www.ntlegacybarbershop.net/
Clean Cuts~2035 Seneca St~Buffalo~NY~14210~716-949-2331~No dedicated website confirmed
Bk''s Barber Shop~1928 South Park Ave~Buffalo~NY~14220~716-253-1878~No dedicated website confirmed
House Of Fades~805 Abbott Rd~Buffalo~NY~14220~716-381-1161~No dedicated website confirmed';
  v_line text; f text[]; v_web text; v_n integer := 0; v_campaign uuid;
begin
  -- Act as the Herman Legacy Digital tenant owner, exactly as the app would.
  -- Nothing here bypasses a permission check: every write goes through the
  -- same SECURITY DEFINER functions a signed-in user would call.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_campaign := transform_audit.upsert_campaign(v_tenant, 'wny_barbers_50',
    'WNY 50 barbershop prospect list (HLD outreach)',
    '{"website": 100}'::jsonb);

  foreach v_line in array string_to_array(v_raw, E'\n') loop
    f := string_to_array(v_line, '~');
    v_n := v_n + 1;
    v_web := nullif(btrim(f[7]), '');
    perform transform_audit.import_shop(v_tenant, jsonb_build_object(
      'business_name',  btrim(f[1]),
      'address_line1',  nullif(btrim(f[2]), ''),
      'locality',       nullif(btrim(f[3]), ''),
      'region',         nullif(btrim(f[4]), ''),
      'postal_code',    nullif(btrim(f[5]), ''),
      'phone',          nullif(btrim(f[6]), ''),
      -- A URL goes to website_url; anything else is a research note and is
      -- NOT stored as a website, because it is not one.
      'website_url',    case when v_web ~* '^https?://' then v_web end,
      'source_file',    'WNY_50_Barber_HLD_Prospect_List.xlsx',
      'source_row',     v_n + 1));
  end loop;

  reset role;
  raise notice 'imported % shops into campaign %', v_n, v_campaign;
end $do$;