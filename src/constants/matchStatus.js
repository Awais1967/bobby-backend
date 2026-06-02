const { BILLING_STATUS } = require("./billingStatus");

const MATCH_STATUS = Object.freeze({
  SETUP: "setup",
  WAITING: "waiting",
  LIVE: "live",
  INTERMISSION: "intermission",
  CLOSED: "closed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const MATCH_CURRENT_STATE = Object.freeze({
  SETUP: "setup",
  WAITING_FOR_TEAMS: "waiting_for_teams",
  QUESTION_OPEN: "question_open",
  QUESTION_CLOSED: "question_closed",
  REVIEWING_ANSWERS: "reviewing_answers",
  INTERMISSION: "intermission",
  GAME_OVER: "game_over",
});

module.exports = {
  BILLING_STATUS,
  MATCH_CURRENT_STATE,
  MATCH_STATUS,
};
