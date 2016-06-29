var _ = require('underscore');
var moment = require('moment');

var moduleExport = {
    groupResultsByVisitId: groupResultsByVisitId,
    //aggregates
    calculateAverageWaitingTime: calculateAverageWaitingTime,
    getIncompleteVisitsCount: getIncompleteVisitsCount,
    calculateMedianWaitingTime: calculateMedianWaitingTime,
    //helpers
    _handleTimeToBeSeenByClinician: _handleTimeToBeSeenByClinician,
    _getTimeSpanInMinutes: _getTimeSpanInMinutes,
    _handleTimeToCompleteVisit: _handleTimeToCompleteVisit
};

module.exports = moduleExport;

function groupResultsByVisitId(arrayOfResults) {
    var grouped = {};

    _.each(arrayOfResults, function (result) {
        if (_.isEmpty(grouped[result.visit_id])) {
            grouped[result.visit_id] = {
                patient_id: result.patient_id,
                patient_uuid: result.patient_uuid,
                names: (result.given_name && result.given_name != null ? result.given_name : '') +
                (result.middle_name && result.middle_name != null ? ' ' + result.middle_name : '') +
                (result.family_name && result.family_name != null ? ' ' + result.family_name : ''),
                identifiers: result.identifiers,

                visit_id: result.visit_id,
                registered: typeof result.triaged === 'string' ? result.visit_start : new Date(result.visit_start).toISOString(),
                visit_end: result.visit_end,
                encounters: []
            };
        }
        var visit = grouped[result.visit_id];
        _handleTriaged(result, visit);
        _handleSeenByClinician(result, visit);
        _handleCompletedVisit(result, visit);
        _handleEncouters(result, visit);
    });
    var results = [];
    for (var e in grouped) {

        //calculate time periods first
        _handleTimeToBeSeenByClinician(grouped[e]);
        _handleTimeToCompleteVisit(grouped[e]);

        results.push(grouped[e]);
    }

    return results;
}

function _handleTriaged(result, visit) {
    //triaged
    //necessary check to ensure the first triage encounter is used
    if (_.isEmpty(visit.triaged)) {
        visit.triaged = null;
        if (result.triaged !== null && result.triaged !== undefined)
            visit.triaged = typeof result.triaged === 'string' ? result.triaged : new Date(result.triaged).toISOString();

        visit.time_to_be_triaged = result.time_to_be_triaged;
    }
}

function _handleSeenByClinician(result, visit) {
    //clinical encounter
    //necessary check to ensure the first clinical encounter is used
    if (_.isEmpty(visit.seen_by_clinician)) {
        visit.seen_by_clinician = null;
        if (result.seen_by_clinician !== null && result.seen_by_clinician !== undefined)
            visit.seen_by_clinician = typeof result.seen_by_clinician === 'string' ? result.seen_by_clinician : new Date(result.seen_by_clinician).toISOString();
    }
}

function _handleEncouters(result, visit) {

    if (!_.isNull(result.encounter_type)) {
        var encounter = {
            encounter_type: result.encounter_type,
            encounter_start: result.encounter_start,
            encounter_end: result.encounter_end
        };
        visit.encounters.push(encounter);
    }

}

function _handleCompletedVisit(result, visit) {
    visit.completed_visit = null;

    if (result.encounter_end !== null && result.encounter_end !== undefined)
        visit.completed_visit = typeof result.encounter_end === 'string' ? result.encounter_end : new Date(result.encounter_end).toISOString();

}

function _handleTimeToBeSeenByClinician(visit) {
    visit.time_to_be_seen_by_clinician = null;

    if (!_.isEmpty(visit.triaged)) {
        if (!_.isEmpty(visit.seen_by_clinician))
            visit.time_to_be_seen_by_clinician =
                _getTimeSpanInMinutes(visit.triaged, visit.seen_by_clinician);
    } else {
        if (!_.isEmpty(visit.seen_by_clinician) && !_.isEmpty(visit.registered))
            visit.time_to_be_seen_by_clinician =
                _getTimeSpanInMinutes(visit.registered, visit.seen_by_clinician);
    }
}

function _handleTimeToCompleteVisit(visit) {
    visit.time_to_complete_visit = null;
    if (_.isEmpty(visit.seen_by_clinician)) return;

    if (!_.isEmpty(visit.registered) && !_.isEmpty(visit.completed_visit)) {
        visit.time_to_complete_visit =
            _getTimeSpanInMinutes(visit.registered, visit.completed_visit);
    }
}

function _getTimeSpanInMinutes(timeA, timeB) {
    var a = moment(timeA);
    var b = moment(timeB);
    return Math.round((b.diff(a) / (1000 * 60)));
}

function calculateAverageWaitingTime(patientFlowArray) {
    var results = {
        averageWaitingTime: '0',
        averageVisitCompletionTime: '0',
        averageTriageWaitingTime: '0',
        averageClinicianWaitingTime: '0'
    };

    var triageSum = 0;
    var triageCount = 0;
    var clinicianSum = 0;
    var clinicianCount = 0;
    var completionSum = 0;
    var completionCount = 0;
    for (var i = 0; i < patientFlowArray.length; i++) {
        var patientFlow = patientFlowArray[i];
        if (patientFlow.time_to_be_triaged !== null &&
            patientFlow.time_to_be_triaged !== undefined) {
            triageSum = triageSum + patientFlow.time_to_be_triaged;
            triageCount++;
        }

        if (patientFlow.time_to_be_seen_by_clinician !== null &&
            patientFlow.time_to_be_seen_by_clinician !== undefined) {
            clinicianSum = clinicianSum + patientFlow.time_to_be_seen_by_clinician;
            clinicianCount++;
        }

        if (patientFlow.time_to_complete_visit !== null &&
            patientFlow.time_to_complete_visit !== undefined) {
            completionSum = completionSum + patientFlow.time_to_complete_visit;
            completionCount++;
        }
    }

    if (triageSum != 0) {
        results.averageTriageWaitingTime = (triageSum / triageCount).toFixed(1);
    }

    if (clinicianSum != 0) {
        results.averageClinicianWaitingTime = (clinicianSum / clinicianCount).toFixed(1);
    }

    if (completionSum != 0) {
        results.averageVisitCompletionTime = (completionSum / completionCount).toFixed(1);
    }

    results.averageWaitingTime =
        ((new Number(results.averageTriageWaitingTime) + new Number(results.averageClinicianWaitingTime)) / 2).toFixed(1);

    return results;
}

function getIncompleteVisitsCount(patientFlowArray) {
    var count = 0;

    for (var i = 0; i < patientFlowArray.length; i++) {
        var patientFlow = patientFlowArray[i];
        if (_.isEmpty(patientFlow.seen_by_clinician)) {
            count++;
        }
    }

    return count;
}

function calculateMedianWaitingTime(patientFlowArray) {

    var waitingTime = _extractWaitingTime(patientFlowArray);

    var medianWaitingTime = {
        medianWaitingTime: '0',
        medianVisitCompletionTime: '0',
        medianTriageWaitingTime: '0',
        medianClinicianWaitingTime: '0'
    };

    if (waitingTime.allWaitingTimes.length > 0)
        medianWaitingTime.medianWaitingTime = _getMedian(waitingTime.allWaitingTimes).toFixed(1);

    if (waitingTime.triageWaitingTimes.length > 0)
        medianWaitingTime.medianTriageWaitingTime = _getMedian(waitingTime.triageWaitingTimes).toFixed(1);

    if (waitingTime.clinicianWaitingTimes.length > 0)
        medianWaitingTime.medianClinicianWaitingTime = _getMedian(waitingTime.clinicianWaitingTimes).toFixed(1);

    if (waitingTime.visitCompletionTimes.length > 0)
        medianWaitingTime.medianVisitCompletionTime = _getMedian(waitingTime.visitCompletionTimes).toFixed(1);

    return medianWaitingTime;

}

function _extractWaitingTime(patientFlowArray) {
    var allWaitingTimes = [];
    var triageWaitingTimes = [];
    var clinicianWaitingTimes = [];
    var visitCompletionTimes = [];

    for (var i = 0; i < patientFlowArray.length; i++) {
        var patientFlow = patientFlowArray[i];
        if (patientFlow.time_to_be_seen_by_clinician !== null &&
            patientFlow.time_to_be_seen_by_clinician !== undefined) {
            clinicianWaitingTimes.push(patientFlow.time_to_be_seen_by_clinician);
            allWaitingTimes.push(patientFlow.time_to_be_seen_by_clinician);
        }
        if (patientFlow.time_to_be_triaged !== null &&
            patientFlow.time_to_be_triaged !== undefined) {
            triageWaitingTimes.push(patientFlow.time_to_be_triaged);
            allWaitingTimes.push(patientFlow.time_to_be_triaged);
        }
        if (patientFlow.time_to_complete_visit !== null &&
            patientFlow.time_to_complete_visit !== undefined) {
            visitCompletionTimes.push(patientFlow.time_to_complete_visit);
        }
    }
    return {
        allWaitingTimes: allWaitingTimes,
        triageWaitingTimes: triageWaitingTimes,
        clinicianWaitingTimes: clinicianWaitingTimes,
        visitCompletionTimes: visitCompletionTimes
    };
}

function _getMedian(data) {
    // extract the .values field and sort the resulting array
    var m = data.sort(function (a, b) {
        return a - b;
    });

    var middle = Math.floor((m.length - 1) / 2); // NB: operator precedence
    if (m.length % 2) {
        return m[middle];
    } else {
        return (m[middle] + m[middle + 1]) / 2.0;
    }
}
