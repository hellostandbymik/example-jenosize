# Follow up

The Follow up menu uses each open lead's `next_follow_up` as its next appointment. Won and Lost leads do not appear. Members see their own leads; super admins see the entire team. The authenticated `GET /api/follow-ups` endpoint applies this scope on the server independently of the Leads page's search, stage filter, and result limit.

Use List for appointments sorted by due time, or Calendar for a monthly overview with an agenda for the selected day. Search matches lead, company, contact and owner. Admins can filter by owner. Summary counts respect the search and owner filter:

- Overdue: appointment time is before now (including earlier today).
- Today: every appointment on the current Thai calendar date.
- Next 7 days: today through six days ahead. This can overlap Today and Overdue.
- Unscheduled: open leads with no next appointment, shown as a list.

All displayed and entered appointment times use Asia/Bangkok (GMT+7), regardless of the browser timezone. Date navigation handles month/year boundaries and leap years. Changing a schedule uses the existing authenticated lead PATCH route, persists its UTC timestamp and adds a timeline activity in the same transaction. An empty appointment field removes the schedule. Changing the schedule does not mark a sales opportunity Won or complete an activity.

The mobile navigation shows menu names and scrolls horizontally. Calendar counts remain compact on phones; appointment details and actions appear below the calendar.
