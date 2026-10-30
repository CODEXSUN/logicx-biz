### * Original Prompt *
```
create new doctype: 'Enquiry Daily Role'
fields: | Enquiry
	  | Date
	  | Role { Options: Lead Creator | Job Assignee }
	  | Member (Link:Employee, Required)
unique constraint: Enquiry + Date + Role
add api (non-whitelisted):
	def merge (Enquiry , Date , Role , Member)
		 Enquiry_Daily_Role = read_by_enquiry_date_role (Enquiry , Date , Role)
		 if Enquiry_Daily_Role is None
			if Member is not None
				insert (Enquiry , Date , Role , Member)
			else
				// nothing to do
		 else
			if Member is not None
				update (Enquiry_Daily_Role, Member)
			else
				delete (Enquiry_Daily_Role)

Enquiry:
	on create & on update:
		invoke-1: 'Enquiry Daily Role'::merge (Enquiry:name, Date:Date, Role:'Lead Creator' , Member:user_employee)
		invoke-1: 'Enquiry Daily Role'::merge (Enquiry:name, Date:Today, Role:'Job Assignee' , Member:assigned_to_employee)
	on delete:
		delete 'Enquiry Daily Role' where Enquiry = this.name

add report 'Enquiry Role Monthly Summary'
	filter: Member (Linke:Employee, optional)
	columns: Year | Month | Jobs | Leads

add report 'Enquiry Role Daily Summary'
	filter: Year (required, default:Today.Year) | Month (required, default:Today.Month) | Member (Linke:Employee, optional)
	columns: Date | Jobs | Leads

add report 'Enquiry Role Report'
	filter: Date (default:Today) | Member (Linke:Employee)
			* Make either Date OR Member is required. Do not fetch if both are not set.
	columns: Date | Member | Job | Assigned To | Lead | Lead By | List in | Status | Title
	            * show Enquiry id/name in Job or Lead base on Role 'Job Assignee' or 'Lead Creator' respectively.
	            * show 'Assigned To' or 'Lead By' base on Role 'Job Assignee' or 'Lead Creator' respectively.
```
