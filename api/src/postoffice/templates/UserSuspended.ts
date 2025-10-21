export default {
  subject: 'Your account has been suspended',
  text: `Hello, {{{safeName.text}}},

Your account has been suspended.

{{{reason}}}

If you believe this is an error, please contact support.

Regards,
The Iotistic Platform Team
`,
  html: `<p>Hello, <b>{{{safeName.html}}}</b>,</p>
<p>Your account has been suspended.</p>
{{{reason}}}
<p>If you believe this is an error, please contact support.</p>
<p>Regards,<br/>The Iotistic Platform Team</p>
`,
};
