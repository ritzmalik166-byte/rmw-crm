# AI calling agent: setup guide

The CRM calls each new lead a few minutes after it arrives, using a voice AI provider (Vapi or Bolna). The provider
holds the conversation; the CRM decides **who** to call and **when**, and stores the **result** on the lead.

## 1. Go live checklist

1. Run the database migration: `cd backend && npm run migrate` (adds `ai_calls`, `ai_call_config`, `leads.do_not_call`,
   and the `aicall.view` / `aicall.manage` permissions).
2. Set `AI_CALL_WEBHOOK_SECRET` in `backend/.env` to a long random string. Restart the API and the worker.
3. **Test with the simulator first:** Super Admin → AI calling → service "Simulator", tick MPF, switch on, save.
   Open any MPF lead → AI calls tab → *Call with AI now*. About 8 seconds later a sample result appears
   (marked *Simulated*). No one is dialled.
4. Set up the real provider (section 2), add its keys to `.env`, restart, pick it in Super Admin → AI calling.
5. Update the consent text on website and Meta lead forms to cover automated calls.

## 2. Provider setup

### Vapi
- Import your Indian number (SIP trunk from Plivo / Exotel / Tata) as a phone number in Vapi. Put its id in `VAPI_PHONE_NUMBER_ID`.
- Create an assistant. Put its id in `VAPI_ASSISTANT_ID` and the private API key in `VAPI_API_KEY`.
- Assistant → Server URL: `https://<crm-domain>/api/integrations/aicall/vapi/webhook`, Server URL secret = `AI_CALL_WEBHOOK_SECRET`.
- Server messages: enable `end-of-call-report` and `status-update`.
- Turn on recording, summary and structured data (fields in section 4).

### Bolna
- Create an agent with an Indian number. Put its id in `BOLNA_AGENT_ID`, the API key in `BOLNA_API_KEY`
  (and the caller number in `BOLNA_FROM_NUMBER` if you have more than one).
- Agent webhook URL: `https://<crm-domain>/api/integrations/aicall/bolna/webhook?token=<AI_CALL_WEBHOOK_SECRET>`.
- Turn on recording, summary and extraction (fields in section 4).

Field names in the provider payloads are parsed defensively, but **check the first real call end to end** before
switching the agent on for all leads.

## 3. Assistant prompt

The CRM sends these variables with every call (Vapi: `{{name}}`; Bolna: `{name}`):

| Variable | Example |
|---|---|
| `opening_line` | Namaste Ravi, this is the automated assistant from MyPropertyFact… |
| `questions` | Numbered list from Super Admin → AI calling |
| `lead_name`, `first_name` | Ravi Kumar, Ravi |
| `brand` | MyPropertyFact |
| `project` | Godrej Tropical Isle |
| `city` | Noida |
| `enquiry_message` | What the customer typed in the form |
| `language` | hinglish / hindi / english |

Suggested system prompt:

```
You are a polite automated assistant calling on behalf of {{brand}} about a property enquiry for {{project}}.
Start with exactly: "{{opening_line}}". If they say it is not a good time, ask when to call back and end politely.
Speak in Hindi or English, following the customer ({{language}}). Keep replies short.
Ask these questions one at a time, skipping any already answered:
{{questions}}
Never quote prices, discounts or availability, and never make commitments: say an advisor will confirm.
If the customer asks to speak to a person, say an advisor will call them shortly.
If they ask not to be called again, apologise, confirm, and end the call.
Customer's original message: {{enquiry_message}}
```

## 4. Answers the provider should extract

Configure these as structured data (Vapi) or extraction fields (Bolna). Other names are mapped where possible.

| Field | Meaning |
|---|---|
| `interested` | yes / no |
| `configuration` | 1/2/3/4 BHK, plot, commercial |
| `budget` | Budget range in the customer's words |
| `location` | Preferred location or sector |
| `purpose` | Self-use or investment |
| `timeline` | When they plan to buy |
| `site_visit` | Wants a visit, and which day |
| `callback_time` | When an advisor should call |
| `opt_out` | true if they asked not to be called |
| `wrong_number` | true if it was not the person who enquired |
| `notes` | Anything else useful |

## 5. What the CRM does with a result

- **Completed:** saves summary, transcript, answers and recording on the lead (AI calls tab), adds an activity, and
  notifies the lead owner (or the people who assign leads, when unassigned).
- **Callback time given:** books a high-priority follow-up for the lead owner about 2 hours later, within calling hours.
- **Opt-out:** sets *Do not call* on the lead; it is never called again.
- **No answer / busy:** retries after the configured gaps (default 30 and 120 minutes, 3 attempts), then tells the owner.
- **Skipped:** junk / test leads, merged leads, non-mobile numbers, leads the team already worked on, and numbers
  called in the last 7 days from another lead.
- Calls only happen within the calling hours (default 9:00 to 21:00 IST); later leads are called the next morning.

Recordings are copied to `backend/storage/ai-call-recordings` (git-ignored) and streamed only to users who can see the lead.
