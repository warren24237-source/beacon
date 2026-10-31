-- Times never show odd minutes (Warren, 31 Oct). A beacon that starts now reads "now till 9:30pm",
-- not "7:22pm to 9:30pm"; a plan that runs to the end of the day reads "to midnight", not "to 12am".
-- Same signature, so every buzz that uses it changes at once and installed apps keep working.
create or replace function public.when_phrase(p_start timestamptz, p_end timestamptz)
returns text language sql stable set search_path = public
as $$
  select
    case
      when p_start <= now() + interval '1 minute' then
        'now till ' ||
        case when (p_end at time zone 'Europe/London')::time = '00:00' then 'midnight'
             else replace(lower(to_char(p_end at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '') end
      else
        case (p_start at time zone 'Europe/London')::date - (now() at time zone 'Europe/London')::date
          when 0 then ''
          when 1 then 'tomorrow, '
          else to_char(p_start at time zone 'Europe/London', 'Dy FMDD Mon') || ', '
        end ||
        replace(lower(to_char(p_start at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '') || ' to ' ||
        case when (p_end at time zone 'Europe/London')::time = '00:00' then 'midnight'
             else replace(lower(to_char(p_end at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '') end
    end;
$$;
