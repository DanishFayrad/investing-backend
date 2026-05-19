const User = require('../models/User');
const Deposit = require('../models/Deposit');
const {
  SUCCESSFUL_REFERRALS_THRESHOLD,
  REFERRAL_MILESTONE_BONUS,
} = require('./referralConfig');

async function countSuccessfulReferrals(userId) {
  const result = await User.aggregate([
    { $match: { referredBy: new (require('mongoose').Types.ObjectId)(String(userId)) } },
    {
      $lookup: {
        from: 'deposits',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$user', '$$uid'] }, { $eq: ['$status', 'approved'] }] } } },
          { $limit: 1 },
        ],
        as: 'approvedDeposits',
      },
    },
    { $match: { 'approvedDeposits.0': { $exists: true } } },
    { $count: 'count' },
  ]);
  return result[0]?.count || 0;
}

async function maybeAwardMilestoneBonus(referrerId) {
  if (!referrerId) return null;
  const referrer = await User.findById(referrerId).select('referralBonusGiven');
  if (!referrer || referrer.referralBonusGiven) return null;

  const successful = await countSuccessfulReferrals(referrerId);
  if (successful < SUCCESSFUL_REFERRALS_THRESHOLD) return null;

  await User.findByIdAndUpdate(referrerId, {
    $inc: { affiliateBalance: REFERRAL_MILESTONE_BONUS, affiliateEarnedTotal: REFERRAL_MILESTONE_BONUS },
    $set: { referralBonusGiven: true },
  });
  return REFERRAL_MILESTONE_BONUS;
}

module.exports = { countSuccessfulReferrals, maybeAwardMilestoneBonus };
