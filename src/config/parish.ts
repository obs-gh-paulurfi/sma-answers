// Parish details shown in the app and given to SMAnswers so it can answer
// practical questions. Anything in [brackets] is a placeholder: SMAnswers is
// told never to guess at one, so it points people to the office instead.
//
// Gathered October 2026 from saintmichaelcc.org and Mass-time listings.
// Re-check Mass and Confession times whenever the schedule changes.

export const parish = {
  appName: "SMAnswers",
  name: "St. Michael the Archangel Catholic Church",
  shortName: "St. Michael's",
  city: "Woodstock, Georgia",
  archdiocese: "Archdiocese of Atlanta",
  timeZone: "America/New_York",

  website: "https://saintmichaelcc.org",
  address: "490 Arnold Mill Road, Woodstock, GA 30188",
  officePhone: "770-516-0009",
  officeEmail: "[office email]",
  officeHours: "Monday through Friday, 9:30 am to 4:00 pm",

  massTimes: [
    "Saturday Vigil: 5:00 pm",
    "Sunday: 7:30 am, 9:00 am, 11:00 am, 12:45 pm, 2:30 pm (Spanish), 5:30 pm (Life Teen)",
    "Weekdays: 6:30 am Monday, Wednesday and Friday (not on civic holidays); 9:00 am Monday through Saturday",
    "Holiday schedules can differ; check the bulletin or website.",
  ],
  confessionTimes: [
    "Wednesday: 5:00 to 6:00 pm",
    "Saturday: 9:30 to 10:30 am",
    "Confessions continue until the last person is heard.",
  ],

  ministries: [
    {
      name: "Adult Faith Formation",
      details:
        "Adult enrichment courses in Scripture, doctrine, prayer and evangelization. Current offerings: https://saintmichaelcc.org/adult-faith-formation",
      contact: "Kathleen Lindemann, Adult Faith Formation Coordinator, 770-516-0009 ext. 252",
    },
    {
      name: "Returning Catholics",
      details:
        "A welcoming, no-pressure group for anyone who has been away from the Church and is thinking about coming home. [meeting time and place]",
      contact: "Faith Formation office, 770-516-9699",
    },
    {
      name: "OCIA (Order of Christian Initiation of Adults)",
      details:
        "For adults interested in becoming Catholic, and for baptized Catholic adults who haven't received First Communion and Confirmation. Details: https://saintmichaelcc.org/rcia-becoming-catholic",
      contact: "Jeanne Yursik, OCIA Director, through the parish office",
    },
    {
      name: "Children's Faith Formation (PSR)",
      details: "Religious education for children and youth. https://saintmichaelcc.org/faith-formation-1",
      contact: "Faith Formation office, 770-516-9699",
    },
  ],

  // Shown on the "Talk to a person" link and used for hand-offs.
  priestContact: "Call the parish office at 770-516-0009 to talk with a priest or deacon",
  emergencyPhone: "678-861-7970",
  emergencySacraments: "678-861-7970 (sacramental emergencies after office hours)",
  victimAssistance:
    "Archdiocese of Atlanta 24-hour abuse reporting line, 1-888-437-0764; for a child, also the Georgia child abuse line, 1-855-422-4453",
} as const;

export type Parish = typeof parish;
