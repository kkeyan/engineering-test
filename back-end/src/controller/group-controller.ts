import { NextFunction, Request, Response } from "express"
import { getRepository } from "typeorm"
import { GroupStudent } from "../entity/group-student.entity"
import { Group } from "../entity/group.entity"
import { Student } from "../entity/student.entity"
import { CreateGroupInterface, UpdateGroupInterface } from "../interface/group.interface"
import { Roll } from "../entity/roll.entity"
import * as moment from "moment"
import { StudentRollState } from "../entity/student-roll-state.entity"

export class GroupController {

  private groupRepository = getRepository(Group)
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRepository = getRepository(Student)
  private studentRollStateRepo = getRepository(StudentRollState)

  async allGroups(request: Request, response: Response, next: NextFunction) {
    // Task 1: 

    // Return the list of all groups
    try {
      return await this.groupRepository.find()
    }
    catch (error) {
      return error.message
    }
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1: 
    const { body: params } = request


    const createGroup: CreateGroupInterface = {
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
      student_count: params.student_count,
      run_at: params.run_at || null
    }
    // initalise class
    const group = new Group()
    group.prepareToCreate(createGroup)
    try {
      let result = await this.groupRepository.save(group)
      return result
    }
    catch (QueryFailedError) {
      return QueryFailedError.message
    }

    // Add a Group
  }

  /**
   * Updates a Group, the ID can be passed either via query params or the request body
   */
  async updateGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1: 
    const { body: params } = request
    const id_to_update = params.id || request.query.id
    const updateGroup: UpdateGroupInterface = {
      id: id_to_update,
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
      student_count: params.student_count,
      run_at: params.run_at || null
    }

    const group = new Group()
    group.prepareToUpdate(updateGroup)
    try {
      let result = await this.groupRepository.update(id_to_update, group)
      return result
    }
    catch (QueryFailedError) {
      return QueryFailedError.message
    }
    // Update a Group
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1: 
    const id_to_delete = request.params.id || request.query.id
    let groupToRemove = await this.groupRepository.findOne(id_to_delete)
    try {
      return await this.groupRepository.remove(groupToRemove)
    }// Delete a Group
    catch (error) {
      return error.message
    }
  }

  /** Removes all the groups from Group Student Repo*/
  async _removeAllGroups() {
    return await this.groupStudentRepository.remove(await this.groupStudentRepository.find())
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    // Task 1: 
    let group_id_to_fetch = request.params.id || request.query.id
    let groups: Group[]
    const group_students = []
    if (group_id_to_fetch) {
      groups = await this.groupRepository.findByIds(group_id_to_fetch)
    }
    else {
      groups = await this.groupRepository.find()
    }
    for (const group of groups) {
      let group_to_push = { "group_id": group['id'], "group_name": group['name'], students: [] }
      const student_group = await this.groupStudentRepository.find({ group_id: group_to_push.group_id })
      for (let student of student_group) {
        const student_data = await this.studentRepository.findOne(student.id)
        group_to_push.students.push({ student_id: student.id, first_name: student_data.first_name, last_name: student_data.last_name, full_name: `${student_data.first_name} ${student_data.last_name}` })
      }
      group_students.push(group_to_push)
    }
    return group_students
    // Return the list of Students that are in a Group
  }

  async _get_filtered_results(group) {
    const pastWeek = moment()
      .date(group.number_of_weeks * -7)
      .toISOString()
    const today = new Date().toISOString()
    return await this.studentRollStateRepo
      .createQueryBuilder("studentrollstate")
      .innerJoin(Roll, "roll", "studentrollstate.student_id = roll.id and roll.completed_at between :pastWeek and :now", { pastWeek: pastWeek, now: today })
      .where(`instr('${group.roll_states}',studentrollstate.state)`)
      .select("studentrollstate.student_id", "student_id")
      .addSelect("COUNT(studentrollstate.student_id)", "incident_count")
      .groupBy("student_id")
      .having(`incident_count ${group.ltmt} :groupIncident`, { groupIncident: group.incidents })
      .getRawMany()
  }

  _buildCondition(queryParams){
    let conditions = ""
      if (queryParams.number_of_weeks) {
        conditions = ` ${conditions} "group"."number_of_weeks" = ${queryParams.number_of_weeks}`
      }
      if (queryParams.roll_states && queryParams.roll_states !="") {
        if (typeof (queryParams.roll_states) == 'string') {
          conditions = ` ${conditions} ${conditions == "" ? "" : "AND"} "group"."roll_states" = '${queryParams.roll_states}'`
        }
        else if (typeof (queryParams.roll_states) == 'object') {
          conditions = ` ${conditions} ${conditions == "" ? "" : "AND"} "group"."roll_states" IN (${queryParams.roll_states.map(state => { return `"${state}"` })})`
        }
      }
      if (queryParams.ltmt) {
        conditions = ` ${conditions} ${conditions == "" ? "" : "AND"} "group"."ltmt" = '${queryParams.ltmt}'`
      }
      if (queryParams.incidents) {
        const incidentExpression = queryParams.incidents.split(' ')
        if (incidentExpression.length == 2) {
          let incidentQury = ""
          switch (incidentExpression[0]) {
            case '<': incidentQury = ` "group"."incidents" < ${incidentExpression[1]}`
              break
            case '>': incidentQury = ` "group"."incidents" > ${incidentExpression[1]}`
              break
            default: incidentQury = ` "group"."incidents" = ${incidentExpression[1]}`
              break
          }
          conditions = ` ${conditions} ${conditions == "" ? "" : "AND"} ${incidentQury}`
        }

      }
    return conditions
  }
  /**
   * 
   * @param queryParams 
   * 
    Time Period in Weeks (number_of_weeks), backwards in time from the date/time Now, AND
    One or more Roll States: "unmark" | "present" | "absent" | "late" (roll_states), AND
    (Greater than the Number of Incidents in the Time Period, OR
    Less then the Number of Incidents in the Time Period) (ltmt and incidents)

   * @returns matching Groups
   */
  async _getAllMatchingGroups(queryParams) {
    if (queryParams == {} || queryParams == undefined) {
      return this.groupRepository.find()
    }
    else {
      const conditions = this._buildCondition(queryParams)
      const matchingGroups = await this.groupRepository
        .createQueryBuilder("group").where(conditions).getMany()
      return matchingGroups
    }
  }

  /**
     * The Students currently in each Group will be deleted
     * The Filter will be run against each Group and the Group populated with Students that match the filter based on their roll data. It will also store the number of incidents for the Student in the incident_count field.
     * The date the filter was run_at against each group will be recorded against the Group
     * The number of students in the group, student_count, will be stored against the Group
   */
  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    const queryParams = request.body

    try {
      await this._removeAllGroups()

      const groups = await this._getAllMatchingGroups(queryParams)
      let students_in_group = []

      for (const group of groups) {
        const filterResult = await this._get_filtered_results(group)
        if (filterResult.length) {
          group.student_count = filterResult.length
          group.run_at = new Date()
        } else {
          group.student_count = 0
          group.run_at = new Date()
        }

        filterResult.forEach((result) => {
          result.group_id = group.id
        })
        students_in_group = students_in_group.concat(filterResult)
      }

      await this.groupStudentRepository.save(students_in_group)
      return await this.groupRepository.save(groups)
    } catch (e) {
      return e.message
    }
  }
}
