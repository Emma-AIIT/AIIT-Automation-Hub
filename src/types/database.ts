/**
 * TypeScript types for the core Supabase database tables used by the Debt Recovery module.
 * Includes `Client`, `WeeklySnapshot`, `ActivityLog`, and the `ClientWithRelations` composite type.
 */
export type ChaseStatus = 'to_chase' | 'do_not_chase'

export type Client = {
    id: string
    xero_contact_id: string
    name: string
    email: string
    phone: string | null
    company: string | null
    current_balance: number
    previous_balance: number
    streak_days: number
    week_change: number
    last_balance_check_date: string | null
    status: 'current' | 'warning' | 'critical' | 'suspended'
    last_payment_date: string | null
    last_contact_date: string | null
    last_call_outcome: string | null
    chase: ChaseStatus
    created_at: string
    updated_at: string
}

export type WeeklySnapshot = {
    id: string
    client_id: string
    week_start: string
    balance: number
    payment_made: boolean
    created_at: string
}

export type ActivityLog = {
    id: string
    client_id: string
    activity_type: 'call' | 'sms' | 'email' | 'payment' | 'suspension'
    outcome: string | null
    recording_url: string | null
    notes: string | null
    created_at: string
}

// Client with relations (for detail views)
export type ClientWithRelations = Client & {
    activity_log: ActivityLog[]
    weekly_snapshots: WeeklySnapshot[]
}