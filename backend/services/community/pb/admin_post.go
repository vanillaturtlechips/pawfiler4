package pb

// CreateAdminPostRequest is manually defined (not protoc-generated).
// Used for the CreateAdminPost RPC which bypasses media/vote requirements.
type CreateAdminPostRequest struct {
	UserId    string   `json:"user_id,omitempty"`
	Title     string   `json:"title,omitempty"`
	Body      string   `json:"body,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	IsCorrect *bool    `json:"is_correct,omitempty"`
}

func (r *CreateAdminPostRequest) GetUserId() string {
	if r != nil {
		return r.UserId
	}
	return ""
}

func (r *CreateAdminPostRequest) GetTitle() string {
	if r != nil {
		return r.Title
	}
	return ""
}

func (r *CreateAdminPostRequest) GetBody() string {
	if r != nil {
		return r.Body
	}
	return ""
}

func (r *CreateAdminPostRequest) GetTags() []string {
	if r != nil {
		return r.Tags
	}
	return nil
}

func (r *CreateAdminPostRequest) GetIsCorrect() bool {
	if r != nil && r.IsCorrect != nil {
		return *r.IsCorrect
	}
	return false
}

// ProtoMessage implements proto.Message interface (needed for grpc-gateway marshaling)
func (r *CreateAdminPostRequest) ProtoMessage() {}
func (r *CreateAdminPostRequest) Reset()        { *r = CreateAdminPostRequest{} }
func (r *CreateAdminPostRequest) String() string { return r.Title }
