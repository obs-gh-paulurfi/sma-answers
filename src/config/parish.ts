// Parish details shown in the app and given to SMAnswers so it can answer
// practical questions. Anything in [brackets] is a placeholder: replace it
// with the real value before launch. SMAnswers is told never to guess at
// a placeholder, so unfilled items are answered with "contact the office".

export const parish = {
  appName: "SMAnswers",
  name: "St. Michael's Catholic Church",
  shortName: "St. Michael's",
  archdiocese: "Archdiocese of Atlanta",
  timeZone: "America/New_York",

  website: "[parish website URL]",
  address: "[street address, city, GA zip]",
  officePhone: "[office phone]",
  officeEmail: "[office email]",
  officeHours: "[office hours]",

  massTimes: [
    "Saturday Vigil: [time]",
    "Sunday: [times]",
    "Weekdays: [times]",
  ],
  confessionTimes: ["[day and time]"],

  ministries: [
    {
      name: "Adult Faith Formation",
      details: "[when it meets, where, and how to join]",
      contact: "[contact name and email]",
    },
    {
      name: "Returning Catholics",
      details:
        "A welcoming, no-pressure group for anyone who has been away from the Church and is thinking about coming home. [meeting time and place]",
      contact: "[contact name and email]",
    },
    {
      name: "OCIA (Order of Christian Initiation of Adults)",
      details: "For adults interested in becoming Catholic. [start date and how to inquire]",
      contact: "[contact name and email]",
    },
  ],

  // Shown on the "Talk to a person" link and used for hand-offs.
  priestContact: "[how to reach a priest, e.g. office phone or rectory email]",
  emergencySacraments: "[after-hours number for Anointing of the Sick / emergencies]",
  victimAssistance: "[Archdiocese of Atlanta victim assistance contact, verify current]",
} as const;

export type Parish = typeof parish;
