export interface CreateGroupInterface {
    name: string,
    number_of_weeks: number,
    roll_states: "unmark" | "present" | "absent" | "late",
    incidents: number,
    ltmt: "<" | ">",
    run_at?: Date
    student_count: number
}

export interface UpdateGroupInterface extends CreateGroupInterface {
    id: number
}
