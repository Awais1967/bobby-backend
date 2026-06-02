const TEAM_STATUS = Object.freeze({
  ACTIVE: "active",
  LEFT: "left",
  REMOVED: "removed",
  DISCONNECTED: "disconnected",
});

const CURRENT_ANSWER_STATUS = Object.freeze({
  NOT_SUBMITTED: "not_submitted",
  SUBMITTED: "submitted",
  LOCKED: "locked",
});

module.exports = {
  CURRENT_ANSWER_STATUS,
  TEAM_STATUS,
};
