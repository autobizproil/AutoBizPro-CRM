<?php

namespace App\Services\Reporting;

use App\Models\Activity;
use App\Models\Client;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Task;

/**
 * Single source of truth for which columns each entity exposes to the widget
 * builder. Nothing outside this registry may reach a SELECT/GROUP BY/WHERE —
 * client-supplied field names are always resolved through it first.
 */
class EntityDescriptor
{
    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return [
            'lead' => [
                'label'       => 'לידים',
                'model'       => Lead::class,
                'table'       => 'leads',
                'ownerColumn' => 'assigned_to',
                'jsonColumn'  => 'custom_fields',
                'valueFields' => [
                    'deal_value' => ['label' => 'ערך עסקה', 'type' => 'number'],
                ],
                'groupFields' => [
                    'source'            => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'status'            => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוח', 'won' => 'נסגר', 'lost' => 'אבוד',
                    ]],
                    'pipeline_stage_id' => ['label' => 'שלב', 'type' => 'lookup', 'lookup' => 'stages'],
                    'assigned_to'       => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'        => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'              => ['label' => 'שם', 'type' => 'text'],
                    'phone'             => ['label' => 'טלפון', 'type' => 'text'],
                    'email'             => ['label' => 'אימייל', 'type' => 'text'],
                    'source'            => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'status'            => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוח', 'won' => 'נסגר', 'lost' => 'אבוד',
                    ]],
                    'pipeline_stage_id' => ['label' => 'שלב', 'type' => 'lookup', 'lookup' => 'stages'],
                    'assigned_to'       => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'        => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'client' => [
                'label'       => 'לקוחות',
                'model'       => Client::class,
                'table'       => 'clients',
                'ownerColumn' => 'assigned_to',
                'jsonColumn'  => 'custom_fields',
                'valueFields' => [],
                'groupFields' => [
                    'source'      => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'company'     => ['label' => 'חברה', 'type' => 'text'],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'        => ['label' => 'שם', 'type' => 'text'],
                    'phone'       => ['label' => 'טלפון', 'type' => 'text'],
                    'email'       => ['label' => 'אימייל', 'type' => 'text'],
                    'company'     => ['label' => 'חברה', 'type' => 'text'],
                    'source'      => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'contact' => [
                'label'       => 'אנשי קשר',
                'model'       => Contact::class,
                'table'       => 'contacts',
                'ownerColumn' => null,
                'jsonColumn'  => 'custom_fields',
                'valueFields' => [],
                'groupFields' => [
                    'company'    => ['label' => 'חברה', 'type' => 'text'],
                    'role'       => ['label' => 'תפקיד', 'type' => 'text'],
                    'created_at' => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'       => ['label' => 'שם', 'type' => 'text'],
                    'phone'      => ['label' => 'טלפון', 'type' => 'text'],
                    'email'      => ['label' => 'אימייל', 'type' => 'text'],
                    'company'    => ['label' => 'חברה', 'type' => 'text'],
                    'role'       => ['label' => 'תפקיד', 'type' => 'text'],
                    'created_at' => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'task' => [
                'label'       => 'משימות',
                'model'       => Task::class,
                'table'       => 'tasks',
                'ownerColumn' => 'assigned_to',
                'jsonColumn'  => null,
                'valueFields' => [],
                'groupFields' => [
                    'status'      => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוחה', 'done' => 'הושלמה',
                    ]],
                    'priority'    => ['label' => 'עדיפות', 'type' => 'enum', 'options' => [
                        'low' => 'נמוכה', 'medium' => 'בינונית', 'high' => 'גבוהה',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                    'due_at'      => ['label' => 'תאריך יעד', 'type' => 'date'],
                ],
                'filterFields' => [
                    'title'       => ['label' => 'כותרת', 'type' => 'text'],
                    'status'      => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוחה', 'done' => 'הושלמה',
                    ]],
                    'priority'    => ['label' => 'עדיפות', 'type' => 'enum', 'options' => [
                        'low' => 'נמוכה', 'medium' => 'בינונית', 'high' => 'גבוהה',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                    'due_at'      => ['label' => 'תאריך יעד', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'due_at' => 'תאריך יעד', 'completed_at' => 'תאריך השלמה'],
            ],

            'activity' => [
                'label'       => 'פעילויות',
                'model'       => Activity::class,
                'table'       => 'activities',
                // Activities are scoped through the lead they belong to, not a column
                // on the row itself — WidgetDataService special-cases this.
                'ownerColumn' => null,
                'jsonColumn'  => null,
                'valueFields' => [],
                'groupFields' => [
                    'type'        => ['label' => 'סוג', 'type' => 'enum', 'options' => [
                        'call' => 'שיחה', 'note' => 'הערה', 'email' => 'מייל', 'meeting' => 'פגישה',
                        'task' => 'משימה', 'whatsapp' => 'וואטסאפ', 'payment' => 'תשלום',
                    ]],
                    'entity_type' => ['label' => 'סוג ישות', 'type' => 'text'],
                    'user_id'     => ['label' => 'משתמש', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'type'        => ['label' => 'סוג', 'type' => 'enum', 'options' => [
                        'call' => 'שיחה', 'note' => 'הערה', 'email' => 'מייל', 'meeting' => 'פגישה',
                        'task' => 'משימה', 'whatsapp' => 'וואטסאפ', 'payment' => 'תשלום',
                    ]],
                    'entity_type' => ['label' => 'סוג ישות', 'type' => 'text'],
                    'user_id'     => ['label' => 'משתמש', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך'],
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    public static function for(string $entity): ?array
    {
        return self::all()[$entity] ?? null;
    }
}
